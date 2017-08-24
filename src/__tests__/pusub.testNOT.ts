import { NatsPubSub } from '../nats-pubsub';
import { logger } from './logger';


describe('PubSub', function () {
    it('can subscribe and is called when events happen', function (done) {
        const ps = new NatsPubSub({ logger });
        ps.subscribe('a', payload => {
            expect(payload).toBe('test');
            done();
        }).then(() => {
            const succeed = ps.publish('a', 'test');
            expect(succeed).toBeTruthy();
        });
    });

    it('can unsubscribe', function (done) {
        const ps = new NatsPubSub({ logger });
        ps.subscribe('a', payload => {
            expect(payload).toBe('test');
        }).then(subId => {
            ps.unsubscribe(subId);
            const succeed = ps.publish('a', 'test');
            expect(succeed).toBeTruthy(); // True because publish success is not
                                        // indicated by trigger having subscriptions
            done(); // works because pubsub is synchronous
        });
    });
});
