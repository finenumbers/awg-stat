export function ServerIcmpHint({ label }: { label: string | null }) {
  if (!label) {
    return null;
  }
  return <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>;
}
