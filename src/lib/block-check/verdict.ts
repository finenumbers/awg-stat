const VERDICT_PRIORITY = [
  "tspu_block",
  "sni_block",
  "dns_spoofing",
  "whitelist",
  "cdn_block",
  "ok",
  "uncertain",
] as const;

type DisplayVerdict = (typeof VERDICT_PRIORITY)[number];

export type ProbeVote = {
  verdicts: string[];
  cdnUnblocked: boolean;
  hostResultsLength: number | null;
};

export type BadgeStatus = "unrestricted" | "blocked" | "unknown";

function isDisplayVerdict(value: string): value is DisplayVerdict {
  return (VERDICT_PRIORITY as readonly string[]).includes(value);
}

function displayVerdicts(vote: ProbeVote, isStaticCdn: boolean): DisplayVerdict[] {
  const displayed: DisplayVerdict[] = [];
  for (const verdict of vote.verdicts) {
    if (!isDisplayVerdict(verdict)) {
      continue;
    }
    if (verdict === "cdn_block" && !isStaticCdn) {
      displayed.push("ok");
      continue;
    }
    if (
      isStaticCdn &&
      !vote.cdnUnblocked &&
      vote.hostResultsLength !== 0 &&
      verdict === "ok"
    ) {
      displayed.push("cdn_block");
      continue;
    }
    displayed.push(verdict);
  }
  return displayed;
}

function chosenDisplayVerdict(vote: ProbeVote, isStaticCdn: boolean): DisplayVerdict | null {
  return VERDICT_PRIORITY.find((candidate) => displayVerdicts(vote, isStaticCdn).includes(candidate)) ?? null;
}

const MAX_PROBE_VOTES = 1000;

/** Size of this finished probe. response_count wins only when it covers every parsed vote. */
export function finishedProbeTotal(voteCount: number, responseCount: number | null): number {
  if (
    responseCount != null &&
    Number.isInteger(responseCount) &&
    responseCount >= 1 &&
    responseCount <= MAX_PROBE_VOTES &&
    responseCount >= voteCount
  ) {
    return responseCount;
  }
  return voteCount;
}

/** TSPU-blocking scanners over every scanner result in the finished probe. */
export function tspuVoteSample(
  votes: ProbeVote[],
  isStaticCdn: boolean,
): { tspuVotes: number; probeVotes: number } | null {
  if (votes.length === 0) {
    return null;
  }
  let tspuVotes = 0;
  for (const vote of votes) {
    if (chosenDisplayVerdict(vote, isStaticCdn) === "tspu_block") {
      tspuVotes += 1;
    }
  }
  return { tspuVotes, probeVotes: votes.length };
}

/** Counts after CDN remapping, in display priority order. Empty when no vote is usable. */
export function formatDisplayedVoteSummary(votes: ProbeVote[], isStaticCdn: boolean): string {
  const counts = new Map<DisplayVerdict, number>();
  for (const vote of votes) {
    const chosen = chosenDisplayVerdict(vote, isStaticCdn);
    if (!chosen) {
      continue;
    }
    counts.set(chosen, (counts.get(chosen) ?? 0) + 1);
  }
  return VERDICT_PRIORITY.flatMap((verdict) => {
    const count = counts.get(verdict) ?? 0;
    return count > 0 ? [`${verdict}=${count}`] : [];
  }).join(" ");
}

/** Majority of scanner votes. Equal counts keep the earlier, stricter verdict. */
export function selectProbeVerdict(votes: ProbeVote[], isStaticCdn: boolean): DisplayVerdict | null {
  if (votes.length === 0) {
    return null;
  }

  const counts = new Map<DisplayVerdict, number>();
  for (const vote of votes) {
    const chosen = chosenDisplayVerdict(vote, isStaticCdn);
    if (!chosen) {
      continue;
    }
    counts.set(chosen, (counts.get(chosen) ?? 0) + 1);
  }

  let winner: DisplayVerdict | null = null;
  let winningVotes = 0;
  for (const verdict of VERDICT_PRIORITY) {
    const count = counts.get(verdict) ?? 0;
    if (count > winningVotes) {
      winner = verdict;
      winningVotes = count;
    }
  }

  if (winner == null || winner === "uncertain") {
    return null;
  }

  return winner;
}

export function resolveBadgeStatus(input: {
  registryBlocked: boolean;
  isStaticCdn: boolean;
  votes: ProbeVote[];
}): BadgeStatus {
  const winner = selectProbeVerdict(input.votes, input.isStaticCdn);
  if (winner === "ok" || winner === "whitelist") {
    return "unrestricted";
  }
  if (
    winner === "tspu_block" ||
    winner === "sni_block" ||
    winner === "dns_spoofing" ||
    winner === "cdn_block"
  ) {
    return "blocked";
  }
  if (input.registryBlocked) {
    return "blocked";
  }
  return "unknown";
}
