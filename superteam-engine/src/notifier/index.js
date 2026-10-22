import { parseJobId } from "../lib/storage/ids.js";

function workIdOf(data) {
  if (typeof data?.id === "string") {
    return data.id;
  }
  if (typeof data?.jobId === "string") {
    return parseJobId(data.jobId).workId;
  }
  return undefined;
}

export function createNotifier({ channels }) {
  async function composeMessage(input, { getWork }) {
    const event = input.event ?? input;
    const type = event.payload?.type;
    const workId = workIdOf(event.payload?.data);
    let text = type;
    if (workId !== undefined) {
      text += `: ${workId}`;
      try {
        const work = await getWork(workId);
        text += ` "${work.title}" (${work.status})`;
      } catch {
        // The text is built without the title and the status.
      }
    }
    if (input.error !== undefined) {
      text += `: ${input.error}`;
    }
    return text;
  }

  async function send(compose) {
    let message;
    try {
      message = await compose();
    } catch (error) {
      console.error("Notifier: composeMessage failed", error);
      return;
    }
    await Promise.allSettled(channels.map((channel) => channel.post(message)));
  }

  return {
    send,
    composeMessage,
  };
}
