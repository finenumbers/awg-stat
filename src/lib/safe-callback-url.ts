const DEFAULT_CALLBACK = "/";

function isUnsafePath(value: string): boolean {
  if (!value.startsWith("/")) return true;
  if (value.startsWith("//")) return true;
  if (value.includes("\\")) return true;
  if (/[\u0000-\u001F\u007F]/.test(value)) return true;
  return false;
}

export function safeCallbackUrl(value: string | null | undefined, fallback = DEFAULT_CALLBACK): string {
  if (!value) return fallback;
  const trimmed = value.trim();
  if (!trimmed || isUnsafePath(trimmed)) return fallback;
  try {
    const decoded = decodeURIComponent(trimmed);
    if (isUnsafePath(decoded) || decoded.includes("://")) return fallback;
  } catch {
    return fallback;
  }
  return trimmed;
}
