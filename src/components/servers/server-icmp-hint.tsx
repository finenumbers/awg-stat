export function ServerIcmpHint({ label }: { label: string | null }) {
  if (!label) {
    return null;
  }
  return (
    <span className="rounded-full bg-yellow-200 px-2 py-0.5 text-xs text-yellow-900">
      {label}
    </span>
  );
}
