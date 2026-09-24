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

/** Majority of scanner votes. Equal counts keep the earlier, stricter verdict. */
export function selectProbeVerdict(votes: ProbeVote[], isStaticCdn: boolean): DisplayVerdict | null {
  if (votes.length === 0) {
    return null;
  }

  const counts = new Map<DisplayVerdict, number>();
  for (const vote of votes) {
    const displayed = displayVerdicts(vote, isStaticCdn);
    const chosen = VERDICT_PRIORITY.find((candidate) => displayed.includes(candidate));
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
