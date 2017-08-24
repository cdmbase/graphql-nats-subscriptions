import { PubSubEngine } from 'graphql-subscriptions/dist/pubsub-engine';
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

    public publish(trigger: string, payload: any): boolean {
        this.logger && this.logger.trace("publishing for queue '%s' (%j)",
            trigger, payload);
        const message = Buffer.from(JSON.stringify(payload), this.parseMessageWithEncoding);
        this.natsConnection.publish(trigger, message);
        return true;
    }

    public subscribe(trigger: string, onMessage: Function, options?: object): Promise<number> {
        this.logger && this.logger.trace("subscribing to queue '%s' with onMessage (%j), and options (%j) ",
            trigger, onMessage, options);

        const triggerName: string = this.triggerTransform(trigger, options);
        const id = this.currentSubscriptionId++;
        this.subscriptionMap[id] = [triggerName, onMessage];

        let refs = this.subsRefsMap[triggerName];
        if (refs && refs.length > 0) {
            this.logger.trace('refs already exist calling it (%j)', refs);
            const newRefs = [...refs, id];
            this.subsRefsMap[triggerName] = newRefs;
            this.logger.trace('returing subId (%s)', id);
            return Promise.resolve(id);
        } else {
            return new Promise<number>((resolve, reject) => {
                // 1. Resolve options object
                this.subscribeOptionsResolver(trigger, options).then(subscriptionOptions => {
                    this.logger.trace('resolve subscriptionoptions with options (%j)', options);
                    // 2. Subscribing using NATS
                    const subId = this.natsConnection.subscribe(triggerName, (msg) => this.onMessage(triggerName, msg));
                    this.subsRefsMap[triggerName] = [...(this.subsRefsMap[triggerName] || []), id];
                    this.natsSubMap[triggerName] = subId;
                    resolve(id);
                });
            });
        }
    }

    public unsubscribe(subId: number) {
        const [triggerName = null] = this.subscriptionMap[subId] || [];
        this.logger.trace('dumping saved subsMappers (%j)', this.subsRefsMap);
        const refs = this.subsRefsMap[triggerName];
        const natsSubId = this.natsSubMap[triggerName];
        this.logger && this.logger.trace("unsubscribing to queue '%s' and natsSid: (%s)", subId, natsSubId);
        if (!refs) {
            this.logger.error('there are no subscriptions for triggerName (%s) and natsSid (%s)', triggerName, natsSubId);
            throw new Error(`There is no subscription of id "${subId}"`);
        }
        if (refs.length === 1) {
            this.logger.trace("unsubscribing and there won't be any subscriber");
            this.natsConnection.unsubscribe(natsSubId);
            delete this.natsSubMap[triggerName];
            delete this.subsRefsMap[triggerName];
            this.logger.trace('unsubscribe on nats for subId (%s) is completed', natsSubId);
        } else {
            const index = refs.indexOf(subId);
            const newRefs = index === -1 ? refs : [...refs.slice(0, index), ...refs.slice(index + 1)];
            this.subsRefsMap[triggerName] = newRefs;
        }

        delete this.subscriptionMap[subId];
    }

    public asyncIterator<T>(triggers: string | string[]): AsyncIterator<T> {
        return new PubSubAsyncIterator<T>(this, triggers);
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
            listener(parsedMessage);
        }
    }
}
