import { blockCheckBadge, blockCheckLabel } from "@/lib/block-check/label";
import { buildDetailUrl } from "@/lib/block-check/probe-stream";
import { formatDateTime } from "@/lib/utils";

export function ServerBlockHint({
  status,
  host,
  checkedAt,
}: {
  status: string | null | undefined;
  host: string;
  checkedAt?: Date | null;
}) {
  const badge = blockCheckBadge(status);
  if (!badge) {
    return null;
  }
  const label = blockCheckLabel(badge);
  const title = checkedAt ? `${label} · ${formatDateTime(checkedAt)}` : label;
  return (
    <a
      href={buildDetailUrl(host)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={title}
      className={
        badge === "blocked"
          ? "pointer-events-auto rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700"
          : "pointer-events-auto rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800"
      }
    >
      {label}
    </a>
  );
}
