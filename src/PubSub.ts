import { PubSubEngine } from 'graphql-subscriptions/dist/pubsub';
import { connect } from 'nats';
import Logger from 'bunyan';
import _ from 'lodash';

export interface NatsPubSubOptions {
    config: string | any,
    connectionListener?: (err: Error) => void;
    logger?: Logger;
}

export class PubSub implements PubSubEngine {
    logger: Logger;
    connection: any;
    nextId: number;
    listeners: Map<number, any>; // { [subId]: onMessage }
    refs: Map<any, Array<number>>; // { [topic]: [ subId1, subId2, ... ] }
    subscriptions: Map<any, any>; // { [topic]: { sid } } -- NATS Subscriptions

    public constructor(options: NatsPubSubOptions) {
        this.connection = connect(options.config);
        this.logger = options.logger;

        this.subscriptions = new Map();
        this.listeners = new Map<number, any>();
        this.refs = new Map();
        this.nextId = 0;
    }

    public publish(topic, payload: any): boolean {
        this.logger.trace("publishing for queue '%s' (%j)", topic, payload);
        try {
            payload = JSON.stringify(payload)
        } catch (e) {
            this.logger.trace("Can not publish message: %j", payload);
            payload = "{}";
        }
        this.connection.publish(topic, payload);
        return true;
    }

    public subscribe(topic: String, onMessage: Function): Promise<number> {
        const id = this.nextId++;
        const subscription = this.subscriptions.get(topic);
        let sid;


        if(!subscription) {
            sid = this.connection.subscribe(topic, msg => this.onMessage(topic, msg));
            this.subscriptions.set(topic, { sid });
        } else {
            sid = subscription.sid;
        }

        this.listeners.set(id, { id, topic, handler: onMessage, sid });
        this.refs.set(topic, [...(this.refs.get(topic) || []), id]);

        return Promise.resolve(id);
    }

    public unsubscribe(sid: number) {
        const subscription = this.listeners.get(sid);
        if(subscription) {
            const { topic } = subscription;
            const ids = this.refs.get(topic) || [];
            _.remove(ids, id => id === sid);

            if(!ids.length) {
                this.connection.unsubscribe(subscription.sid);
                this.subscriptions.delete(topic);
                this.refs.delete(topic);
                this.listeners.delete(sid);
            } else {
                this.refs.set(topic, ids);
            }
        }
    }

    private onMessage(topic, msg) {
        try {
            msg = JSON.parse(msg)
        } catch(e) {
            this.logger.trace("Can not parse message: %j", msg);
            msg = {};
        }
        const listeners = this.refs.get(topic) || [];
        listeners.forEach(sid => {
            if(this.listeners.has(sid)) {
                this.logger.trace("sending message to subscriber callback function '(%j)'", msg);
                const { handler } = this.listeners.get(sid);
                handler(msg);
            }
        });
    }
}