# Google Chat

Sends the notifications to people through Google Chat. For now it is the only
notifier.

## Component

- It posts a message to the webhook of a Google Chat space.
- It decides by itself which events it acts on. It receives the events of the
  topics it follows, and it builds its own message, reading the records it
  needs. For example, it posts when a task has just started and is given to a
  person.
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
