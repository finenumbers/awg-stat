export type BlockCheckToken =
  | { kind: "missing" }
  | { kind: "invalid" }
  | { kind: "ready"; value: string };

const UNSAFE_TOKEN = /[\s\u0000-\u001f\u007f]/;

/** Trim, drop one leading Bearer prefix, and reject header-unsafe values. */
export function readBlockCheckToken(raw: string | null | undefined): BlockCheckToken {
  if (raw == null) {
    return { kind: "missing" };
  }
  const trimmed = raw.trim().replace(/^bearer(?:\s+|$)/i, "").trim();
  if (trimmed.length === 0) {
    return { kind: "missing" };
  }
  if (UNSAFE_TOKEN.test(trimmed)) {
    return { kind: "invalid" };
  }
  return { kind: "ready", value: trimmed };
}
