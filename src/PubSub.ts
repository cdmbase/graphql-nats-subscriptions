import { PubSubEngine } from 'graphql-subscriptions/dist/pubsub';
import { connect } from 'nats';
import { Logger } from 'bunyan';

interface NatsConnection {
    url: String
    token: String
    user: String
    pass: String
}

interface NatsPubSubOptions {
    config: NatsConnection | string,
    connectionListener?: (err: Error) => void;
    logger?: Logger;
}

class PubSub implements PubSubEngine {
    connection: any;
    nextId: number;
    refs: Map;
    subscriptions: Map;

    constructor(options: NatsPubSubOptions) {
        this.connection = connect(options.config);

        this.subscriptionMap = {};
        this.refs = {};
        this.nextId = 0;
    }

    public publish(topic, payload): boolean {
        this.connection.publish(topic, payload);

        return true;
    }

    public subscribe(topic, onMessage): Promise<number> {

    }
}

export default PubSub