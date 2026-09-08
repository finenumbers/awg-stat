import { isIP } from "node:net";

const HOSTNAME =
  /^(?=.{1,253}$)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

export function isSafeProbeHost(host: string): boolean {
  const value = host.trim();
  if (!value || value.length > 253 || value.startsWith("-")) {
    return false;
  }
  if (/[\s;|&$`'<>\\]/.test(value)) {
    return false;
  }
  if (isIP(value)) {
    return true;
  }
  return HOSTNAME.test(value);
}
