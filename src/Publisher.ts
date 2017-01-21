import { INatsPublisherOptions } from './INatsOptions';

class Publisher {
    private connection: any;
    private subscription: any;

    constructor(options: INatsPublisherOptions) {
        let { connection, subscription } = options;

        this.subscription = subscription;
        this.connection = connection;

        subscription.subscribe()
    }
}

export default Publisher;