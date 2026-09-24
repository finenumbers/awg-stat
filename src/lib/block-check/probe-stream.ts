import type { ProbeVote } from "./verdict";

export type SseEvent = {
  event: string;
  data: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CHEBURCHECK_ORIGIN = "https://cheburcheck.ru";

export function buildCheckUrl(host: string): string {
  return `${CHEBURCHECK_ORIGIN}/api/v1/check?target=${encodeURIComponent(host.trim())}`;
}

export function buildProbeUrl(id: string): string | null {
  if (!UUID_PATTERN.test(id)) {
    return null;
  }
  return `${CHEBURCHECK_ORIGIN}/api/v1/probe/${id}`;
}

export function buildDetailUrl(host: string): string {
  return `${CHEBURCHECK_ORIGIN}/check?target=${encodeURIComponent(host.trim())}`;
}

function parseSseBlock(raw: string): SseEvent | null {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of raw.split("\n")) {
    if (!line || line.startsWith(":")) {
      continue;
    }
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }
  if (dataLines.length === 0) {
    return null;
  }
  return { event, data: dataLines.join("\n") };
}

export function consumeSseBuffer(buffer: string): { events: SseEvent[]; rest: string } {
  const events: SseEvent[] = [];
  let rest = buffer.replace(/\r\n/g, "\n");
  while (true) {
    const split = rest.indexOf("\n\n");
    if (split === -1) {
      break;
    }
    const parsed = parseSseBlock(rest.slice(0, split));
    rest = rest.slice(split + 2);
    if (parsed) {
      events.push(parsed);
    }
  }
  return { events, rest };
}

export function voteFromProbeEvent(data: string): ProbeVote | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  const record = parsed as { verdicts?: unknown; cdn_unblocked?: unknown; host_results?: unknown };
  if (!Array.isArray(record.verdicts)) {
    return null;
  }
  const verdicts = record.verdicts.filter((verdict): verdict is string => typeof verdict === "string");
  const hostResultsLength = Array.isArray(record.host_results) ? record.host_results.length : null;
  return {
    verdicts,
    cdnUnblocked: record.cdn_unblocked === true,
    hostResultsLength,
  };
}

export function votesFromSseEvents(events: SseEvent[]): { votes: ProbeVote[]; done: boolean } {
  const votes: ProbeVote[] = [];
  let done = false;
  for (const event of events) {
    if (event.event === "result") {
      const vote = voteFromProbeEvent(event.data);
      if (vote) {
        votes.push(vote);
      }
    }
    if (event.event === "done") {
      done = true;
    }
  }
  return { votes, done };
}
