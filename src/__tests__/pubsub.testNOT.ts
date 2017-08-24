// import { NatsPubSub } from '../nats-pubsub';
// import { spy, restore } from 'simple-mock';
// import nats from 'nats';
// import { logger } from './logger';
// import 'jest';


// // ----------------- Mocking NATS Client ----------------------

// let listener;

// const publishSpy = jest.spyOn((channel, message) => listener && listener(channel, message));
// const subscribeSpy = jest.spyOn((topic, options, cb) => cb && cb(null, [{ ...options, topic }]));
// const unsubscribeSpy = jest.spyOn(nats, 'unsubscribe');

// const natsPackage = nats as object;

// const connect = function () {
//     return {
//         publish: publishSpy,
//         subscribe: subscribeSpy,
//         unsubscribe: unsubscribeSpy,
//         on: (event, cb) => {
//             if (event === 'message') {
//                 listener = cb;
//             }
//         },
//     };
// };


// natsPackage['connect'] = connect;

// // --------------- Mocking NATS Client ----------------------------

// describe('NATSPubSub', function () {

//     const pubSub = new NatsPubSub({ logger });

//     it('can subscribe to specific nats channel and called whne a message is published on it', function (done) {
//         let sub;
//         const onMessage = message => {
//             logger.trace('onMessage with message %(s)', sub)
//             pubSub.unsubscribe(sub);
//             logger.debug(unsubscribeSpy.callCount);
//             expect(unsubscribeSpy).toBeCalled();
//             try {
//                 expect(message).toEqual('test');
//                 done();
//             } catch (e) {
//                 done.fail(e);
//             }
//         };

//         pubSub.subscribe('Posts', onMessage).then(subId => {
//             logger.trace('expected subId to be 0 and received (%s)', subId);

//             expect(subId).toBeDefined();
//             sub = subId;
//             logger.trace('unsub count ---- (%j)', sub);
//             pubSub.publish('Posts', 'test');
//         }).catch(err => done(err));
//     });

//     it('can unsubscribe from specific nats channel', function (done) {
//         pubSub.subscribe('Posts', () => null).then(subId => {
//             logger.trace('received subId is (%s)', subId);
//             pubSub.unsubscribe(subId);
//             setTimeout(() => {
//                 try {
//                     expect(unsubscribeSpy).toBeCalled();

//                     // expect(call.args).toHaveProperty('Posts');
//                     done();
//                 } catch (e) {
//                     done.fail(e);
//                 }
//             }, 5);

//         });
//     });

//     // it('cleans up correctly the memory when unsubscribing', function (done) {
//     //     Promise.all([
//     //         pubSub.subscribe('Posts', () => null),
//     //         pubSub.subscribe('Posts', () => null),
//     //     ])
//     //         .then(([subId, secondSubId]) => {
//     //             try {
//     //                 // This assertion is done against a private number, if you change the intervals, you may want to change that
//     //                 expect((pubSub as any).subscriptionMap[subId]).toBeDefined();
//     //                 pubSub.unsubscribe(subId);

//     //                 // This assertion is done agains a private member, if you change the internals, you may want to change that
//     //                 expect((pubSub as any).subscriptionMap[subId]).toBeDefined();
//     //                 expect(() => pubSub.unsubscribe(subId)).toThrow(`There is no subscription of id "${subId}"`);
//     //                 pubSub.unsubscribe(secondSubId);
//     //                 done();
//     //             } catch (e) {
//     //                 done.fail(e);
//     //             }
//     //         })
//     // })
// });
