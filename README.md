# graphql-nats-subscriptions

This package implements the PusSubEngine Interface from the graphql-subscriptions package. 
It allows you to connect your subscriptions manger to an NATS enabled Pub Sub broker to support 
horizontally scalable subscriptions setup.
This package is an adapted version of [graphql-redis-subscriptions](https://github.com/davidyaha/graphql-redis-subscriptions) package.
   
   
## Basic Usage

```javascript
import { NatsPubSub } from 'graphql-nats-subscriptions';
const pubsub = new NatsPubSub(); // connecting to nats://localhost on default
const subscriptionManager = new SubscriptionManager({
  schema,
  pubsub,
  setupFunctions: {},
});
```

You needs `gnatsd daemon` running in background. Check out https://nats.io to start on your machine. 
## Using Trigger Transform

As the [graphql-redis-subscriptions](https://github.com/davidyaha/graphql-redis-subscriptions) package, this package support
a trigger transform function. This trigger transform allows you to use the `channelOptions` object provided to the `SubscriptionManager`
instance, and return trigger string which is more detailed then the regular trigger. 

First I create a simple and generic trigger transform 
```javascript
const triggerTransform = (trigger, {path}) => [trigger, ...path].join('.');
```
> Note that I expect a `path` field to be passed to the `channelOptions` but you can do whatever you want.

Next, I'll pass the `triggerTransform` to the `NatsPubSub` constructor.
```javascript
const pubsub = new NatsPubSub({
  triggerTransform,
});
```
Lastly, I provide a setupFunction for `commentsAdded` subscription field.
It specifies one trigger called `comments.added` and it is called with the `channelOptions` object that holds `repoName` path fragment.
```javascript
const subscriptionManager = new SubscriptionManager({
  schema,
  setupFunctions: {
    commentsAdded: (options, {repoName}) => ({
      'comments/added': {
        channelOptions: { path: [repoName] },
      },
    }),
  },
  pubsub,
});
```
> Note that here is where I satisfy my `triggerTransform` dependency on the `path` field.

When I call `subscribe` like this:
```javascript
const query = `
  subscription X($repoName: String!) {
    commentsAdded(repoName: $repoName)
  }
`;
const variables = {repoName: 'graphql-redis-subscriptions'};
subscriptionManager.subscribe({ query, operationName: 'X', variables, callback });
```

The subscription string that Redis will receive will be `comments.added.graphql-redis-subscriptions`.
This subscription string is much more specific and means the the filtering required for this type of subscription is not needed anymore.
This is one step towards lifting the load off of the graphql api server regarding subscriptions.

## Passing your own client object

The basic usage is great for development and you will be able to connect to any nats enabled server running on your system seamlessly.
But for any production usage you should probably pass in your own configured client object;
 
```javascript
import { connect } from 'nats';
import { NatsPubSub } from 'graphql-nats-subscriptions';

const client = connect('nats://test.mosquitto.org', {
  reconnectPeriod: 1000,
});

const pubsub = new NatsPubSub({
  client,
});
```

You can learn more on the nats options object [here](https://github.com/nats-io/node-nats).


## Change encoding used to encode and decode messages

Supported encodings available [here](https://nodejs.org/api/buffer.html#buffer_buffers_and_character_encodings) 

```javascript
const pubsub = new NatsPubSub({
  parseMessageWithEncoding: 'utf16le',
});
```
