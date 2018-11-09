import { PubSubEngine } from 'graphql-subscriptions';
import { connect, Client, ClientOpts, SubscribeOptions, NatsError } from 'nats';
import { PubSubAsyncIterator } from './pubsub-async-iterator';
import * as Logger from 'bunyan';
import _ from 'lodash';


export type Path = Array<string | number>;
export type Trigger = string | Path;
export type TriggerTransform = (trigger: Trigger, channelOptions?: object) => string;
export type SubscribeOptionsResolver = (trigger: Trigger, channelOptions?: object) => Promise<SubscribeOptions>;
export type PublishOptionsResolver = (trigger: Trigger, payload: any) => Promise<any>;

export interface NatsPubSubOptions {
    client?: Client;
    subscribeOptions?: SubscribeOptionsResolver;
    publishOptions?: PublishOptionsResolver;
    connectionListener?: (err: Error) => void;
    // onNatsSubscribe?: (id: number, granted: ISubscriptionGrant[]) => void;
    triggerTransform?: TriggerTransform;
    parseMessageWithEncoding?: string;
    logger?: Logger;
}

export class NatsPubSub implements PubSubEngine {

    private triggerTransform: TriggerTransform;
    private publishOptionsResolver: PublishOptionsResolver;
    private subscribeOptionsResolver: SubscribeOptionsResolver;
    private natsConnection: Client;

    // { [subId]: {topic, natsSid, onMessage} } -- NATS Subscriptions
    private subscriptionMap: { [subId: number]: [string, Function] };
    // { [topic]: [ subId1, subId2, ...]}
    private subsRefsMap: { [trigger: string]: Array<number> };
    // { [topic]: { natsSid }}
    private natsSubMap: { [trigger: string]: number };
    private currentSubscriptionId: number;
    private parseMessageWithEncoding: string;
    private logger: Logger;

    public constructor(options: NatsPubSubOptions = {}) {
        this.triggerTransform = options.triggerTransform || (trigger => trigger as string);

        if (options.client) {
            this.natsConnection = options.client;
        } else {
            const brokerUrl = 'nats://127.0.0.1:4222';
            this.natsConnection = connect(brokerUrl);
        }

        this.logger = options.logger.child({ className: 'nats-subscription' });

        if (options.connectionListener) {
            this.natsConnection.on('connect', options.connectionListener);
            this.natsConnection.on('error', options.connectionListener);
            this.natsConnection.on('disconnect', options.connectionListener);
            this.natsConnection.on('reconnecting', options.connectionListener);
            this.natsConnection.on('reconnect', options.connectionListener);
            this.natsConnection.on('close', options.connectionListener);
        } else {
            this.natsConnection.on('error', this.logger && this.logger.error);
        }

        this.subscriptionMap = {};
        this.subsRefsMap = {};
        this.natsSubMap = {};
        this.currentSubscriptionId = 0;
        // this.onNatsSubscribe = options.onNatsSubscribe || (() => null);
        this.publishOptionsResolver = options.publishOptions || (() => Promise.resolve({}));
        this.subscribeOptionsResolver = options.subscribeOptions || (() => Promise.resolve({}));
        this.parseMessageWithEncoding = options.parseMessageWithEncoding;
    }

    public async publish(trigger: string, payload: any): Promise<void> {
        this.logger.trace("publishing to queue '%s' (%j)",
            trigger, payload);
        const message = Buffer.from(JSON.stringify(payload), this.parseMessageWithEncoding);
        await this.natsConnection.publish(trigger, message);
    }

    public async subscribe(trigger: string, onMessage: Function, options?: object): Promise<number> {
        this.logger.trace("subscribing to queue '%s' with onMessage (%j), and options (%j) ",
            trigger, onMessage, options);

        const triggerName: string = this.triggerTransform(trigger, options);
        const id = this.currentSubscriptionId++;
        this.subscriptionMap[id] = [triggerName, onMessage];

        let refs = this.subsRefsMap[triggerName];
        if (refs && refs.length > 0) {
            this.logger.trace('relavent topic (%s) is already subscribed', triggerName);
            const newRefs = [...refs, id];
            this.subsRefsMap[triggerName] = newRefs;
            return await id;
        } else {
            // return new Promise<number>((resolve, reject) => {
            this.logger.trace('topic (%s) is new and yet to be subscribed', triggerName);
            // 1. Resolve options object
            // this.subscribeOptionsResolver(trigger, options).then(subscriptionOptions => {
            this.logger.trace('resolve subscriptionoptions with options (%j)', options);
            // 2. Subscribing using NATS
            const subId = this.natsConnection.subscribe(triggerName, (msg) => this.onMessage(triggerName, msg));
            this.subsRefsMap[triggerName] = [...(this.subsRefsMap[triggerName] || []), id];
            this.natsSubMap[triggerName] = subId;
            return await id;
            // });
            // });

        }
    }

    public unsubscribe(subId: number) {
        const [triggerName = null] = this.subscriptionMap[subId] || [];
        const refs = this.subsRefsMap[triggerName];
        const natsSubId = this.natsSubMap[triggerName];
        this.logger.trace("unsubscribing to queue '%s' and natsSid: (%s)", subId, natsSubId);
        if (!refs) {
            this.logger.error('there are no subscriptions for triggerName (%s) and natsSid (%s)', triggerName, natsSubId);
            throw new Error(`There is no subscription of id "${subId}"`);
        }
        if (refs.length === 1) {
            this.natsConnection.unsubscribe(natsSubId);
            delete this.natsSubMap[triggerName];
            delete this.subsRefsMap[triggerName];
            this.logger.trace('unsubscribe on nats for subId (%s) is completed and there is no subscriber to topic (%s)',
                natsSubId, triggerName);
        } else {
            const index = refs.indexOf(subId);
            const newRefs = index === -1 ? refs : [...refs.slice(0, index), ...refs.slice(index + 1)];
            this.subsRefsMap[triggerName] = newRefs;
            this.logger.trace('unsubscribe on nats for subId (%s) is completed and there are still (%s) subscribers', newRefs.length);
        }

        delete this.subscriptionMap[subId];
    }

    public asyncIterator<T>(triggers: string | string[]): AsyncIterator<T> {
        this.logger.trace('asyncIterator called with trigger (%j)', triggers);
        return new PubSubAsyncIterator<T>(this, triggers, this.logger);
    }

    private onMessage(topic: string, message: Buffer) {
        this.logger.trace('triggered onMessage with topic (%s), message (%j)', topic, message);
        const subscribers = this.subsRefsMap[topic];

        // Don't work for nothing..
        if (!subscribers || !subscribers.length) {
            return;
        }

        const messageString = message.toString(this.parseMessageWithEncoding);
        let parsedMessage;
        try {
            parsedMessage = JSON.parse(messageString);
        } catch (e) {
            parsedMessage = messageString;
        }

        for (const subId of subscribers) {
            const listener = this.subscriptionMap[subId][1];
            this.logger.trace('subscription listener to run for subId (%s)', subId);
            listener(parsedMessage);
        }
    }
}
