export type BlockCheckBadgeStatus = "unrestricted" | "blocked";

export const BLOCK_UNRESTRICTED_LABEL = "Не ограничен";
export const BLOCK_BLOCKED_LABEL = "Заблокирован";

export function blockCheckBadge(status: string | null | undefined): BlockCheckBadgeStatus | null {
  if (status === "unrestricted" || status === "blocked") {
    return status;
  }
  return null;
}

export function blockCheckLabel(status: BlockCheckBadgeStatus): string {
  return status === "unrestricted" ? BLOCK_UNRESTRICTED_LABEL : BLOCK_BLOCKED_LABEL;
}
