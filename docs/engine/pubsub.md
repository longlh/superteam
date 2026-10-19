# Pub/Sub

The way the engine informs the other parts about its events, such as the Agents
and the Notifier.

## Component

- It is built on the subscribers of the engine loop (see `engineloop.md`). The
  loop calls a subscriber when a notification fires, and it does not know who
  its subscribers are.
- The notifications are `event:done`, `event:retry` and `event:error`. Each one
  carries the event, so a subscriber reads what happened from the `payload` of
  the event, such as its `type`.
- A part subscribes with a config file, a subscription. Every subscription whose
  topic matches an event receives it, and nothing is returned to the engine.
- A subscription has these fields:

  | Field   | Description                                                                                                  |
  | ------- | ------------------------------------------------------------------------------------------------------------ |
  | `topic` | The events that the part receives.                                                                           |
  | `addon` | The name of the part that receives the events, such as `googlechat`.                                         |
  | `env`   | The names that the part expects, mapped to the names of environment variables, such as `webhook` to the URL. |

- The part filters by itself: it decides which of the events it acts on.
- A subscription holds no secret. Only the names of the environment variables
  are stored, never their values, because the data is versioned in git.
- A subscriber is called in the order of its subscription, and the loop does not
  wait for it. An error of a subscriber does not stop the loop or the other
  subscribers.

## Open questions

These are not decided yet.

1. **Where the subscriptions are kept.** `storage.md` has no entity for a
   subscription.
2. **The topic.** In the draft schema a topic is `{entity}:{operation}`, such as
   `_task:update`. The events of the engine have a `type` such as `work:assign`.
   What a `topic` matches is not decided.
3. **The name `addon`.** It comes from the draft schema, where the receiver was
   an addon of the plugin. Here the receiver is a part, such as the Notifier.
