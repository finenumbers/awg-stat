export type BlockCheckBadgeStatus = "unrestricted" | "blocked";

export const BLOCK_UNRESTRICTED_LABEL = "Не ограничен";
export const BLOCK_BLOCKED_LABEL = "Заблокирован";

export function blockCheckBadge(status: string | null | undefined): BlockCheckBadgeStatus | null {
  if (status === "unrestricted" || status === "blocked") {
    return status;
  }
  return null;
}

export function blockCheckLabel(
  status: BlockCheckBadgeStatus,
  sample?: { tspuVotes?: number | null; probeVotes?: number | null },
): string {
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
    return base;
  }
  return `${base} (${tspuVotes}/${probeVotes})`;
}
