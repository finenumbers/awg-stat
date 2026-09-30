import { createHash, timingSafeEqual } from "node:crypto";

export function bearerMatches(header: string | undefined, token: string): boolean {
  const actual = createHash("sha256").update(header ?? "").digest();
  const expected = createHash("sha256").update(`Bearer ${token}`).digest();
  return timingSafeEqual(actual, expected);
}
