import { ICMP_UNAVAILABLE_LABEL } from "@/lib/latency";

export function ServerIcmpHint({ label }: { label: string | null }) {
  if (!label) {
    return null;
  }
  const unavailable = label === ICMP_UNAVAILABLE_LABEL;
  return (
    <span
      className={
        unavailable
          ? "rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700"
          : "rounded-full bg-yellow-200 px-2 py-0.5 text-xs text-yellow-900"
      }
    >
      {label}
    </span>
  );
}
