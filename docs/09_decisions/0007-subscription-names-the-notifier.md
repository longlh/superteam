# ADR 7. A subscription names the Notifier

- Status: Superseded by ADR 12

## Context

A subscription says which part receives the events of the engine. The Notifier
builds the message and sends it through a channel, and Google Chat is one
channel.

## Decision

The `addon` of a subscription is the Notifier. Google Chat is a channel that the
Notifier dispatches to, so it is not subscribed directly. The subscription holds
only the names of the environment variables, never their values, because the
data is versioned in git.

## Consequences

- The Notifier is the only part that knows the topics and the channels.
- A `topic` matches the name of a notification exactly, such as `event:error`
  (see `pubsub.md`).
