export type BlockCheckBadgeStatus = "unrestricted" | "blocked";

export const BLOCK_UNRESTRICTED_LABEL = "Не ограничен";
export const BLOCK_BLOCKED_LABEL = "Заблокирован";

export function blockCheckBadge(status: string | null | undefined): BlockCheckBadgeStatus | null {
  if (status === "unrestricted" || status === "blocked") {
    return status;
  }
  return null;
}

export type BlockCheckLabelParts = {
  base: string;
  tspuVotes: number | null;
  probeVotes: number | null;
  emphasizeTspu: boolean;
};

export function blockCheckLabelParts(
  status: BlockCheckBadgeStatus,
  sample?: { tspuVotes?: number | null; probeVotes?: number | null },
): BlockCheckLabelParts {
  const base = status === "unrestricted" ? BLOCK_UNRESTRICTED_LABEL : BLOCK_BLOCKED_LABEL;
  const tspuVotes = sample?.tspuVotes;
  const probeVotes = sample?.probeVotes;
  if (
    tspuVotes == null ||
    probeVotes == null ||
    !Number.isInteger(tspuVotes) ||
    !Number.isInteger(probeVotes) ||
    probeVotes <= 0 ||
    tspuVotes < 0 ||
    tspuVotes > probeVotes
  ) {
    return { base, tspuVotes: null, probeVotes: null, emphasizeTspu: false };
  }
  return { base, tspuVotes, probeVotes, emphasizeTspu: tspuVotes > 0 };
}

export function blockCheckLabel(
  status: BlockCheckBadgeStatus,
  sample?: { tspuVotes?: number | null; probeVotes?: number | null },
): string {
  const parts = blockCheckLabelParts(status, sample);
  if (parts.tspuVotes == null || parts.probeVotes == null) {
    return parts.base;
  }
  return `${parts.base} (${parts.tspuVotes}/${parts.probeVotes})`;
}
