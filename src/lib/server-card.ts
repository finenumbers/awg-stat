import { blockCheckBadge } from "@/lib/block-check/label";
import { ICMP_UNAVAILABLE_LABEL } from "@/lib/latency";

export function overviewCardChrome(input: {
  icmpLabel: string | null;
  blockStatus: string | null | undefined;
}): string {
  if (input.icmpLabel === ICMP_UNAVAILABLE_LABEL) {
    return "border-red-200 bg-red-50 hover:bg-red-100";
  }
  if (blockCheckBadge(input.blockStatus) === "blocked") {
    return "border-sky-200 bg-sky-50 hover:bg-sky-100";
  }
  return "hover:bg-accent/40";
}
