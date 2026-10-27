import {
  BLOCK_CHECK_FRACTION_SEPARATOR,
  blockCheckBadge,
  blockCheckLabel,
  blockCheckLabelParts,
} from "@/lib/block-check/label";
import { buildDetailUrl } from "@/lib/block-check/probe-stream";
import { formatDateTime } from "@/lib/utils";

export function ServerBlockHint({
  status,
  host,
  checkedAt,
  tspuVotes,
  probeVotes,
}: {
  status: string | null | undefined;
  host: string;
  checkedAt?: Date | null;
  tspuVotes?: number | null;
  probeVotes?: number | null;
}) {
  const badge = blockCheckBadge(status);
  if (!badge) {
    return null;
  }
  const parts = blockCheckLabelParts(badge, { tspuVotes, probeVotes });
  const label = blockCheckLabel(badge, { tspuVotes, probeVotes });
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
      {parts.tspuVotes == null || parts.probeVotes == null ? (
        parts.base
      ) : (
        <>
          {parts.base} (
          {parts.emphasizeTspu ? <span className="text-red-700">{parts.tspuVotes}</span> : parts.tspuVotes}
          {BLOCK_CHECK_FRACTION_SEPARATOR}
          {parts.probeVotes})
        </>
      )}
    </a>
  );
}
