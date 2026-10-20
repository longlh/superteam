# Google Chat

Sends the notifications to people through Google Chat. For now it is the only
channel that the Notifier dispatches to (see `notifier.md`).

## Component

- It posts a message to the webhook of a Google Chat space.
- It receives a message, and posts it. It does not choose the events, and it
  does not build the message.
- The URL of the webhook is a secret. The data keeps only the name of the
  environment variable that holds it, and never its value, because the data is
  versioned in git.
- It has a short time to answer, 10 seconds. If it fails or is too slow, the
  event is skipped: it does not stop the other parts, and it is not retried.

## Code

The configuration maps the names that the notifier expects to the names of the
environment variables:

```json
{ "webhook": "SUPERTEAM_GCHAT_WEBHOOK" }
```
