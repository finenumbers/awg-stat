export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorLevel(error: unknown): string {
  if (typeof error === "object" && error && "level" in error) {
    return String((error as { level?: unknown }).level ?? "");
  }
  return "";
}

function errorCode(error: unknown): string {
  if (typeof error === "object" && error && "code" in error) {
    return String((error as { code?: unknown }).code ?? "");
  }
  return "";
}

export function isCollectorError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { name?: string }).name === "CollectorError";
}

export function isSshSessionRevokedError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { name?: string }).name === "SshSessionRevokedError";
}

export function isSshAuthError(error: unknown): boolean {
  const level = errorLevel(error);
  if (level === "client-authentication") {
    return true;
  }
  const message = errorMessage(error);
  return /authentication|all configured authentication methods failed|permission denied/i.test(message);
}

export function isSshTransportError(error: unknown): boolean {
  if (isCollectorError(error) || isSshAuthError(error) || isSshSessionRevokedError(error)) {
    return false;
  }

  const level = errorLevel(error);
  if (level === "client-timeout" || level === "client-socket") {
    return true;
  }

  const code = errorCode(error);
  if (/^(ECONNRESET|EPIPE|ETIMEDOUT|ECONNREFUSED|ENETUNREACH|EHOSTUNREACH)$/.test(code)) {
    return true;
  }

  const message = errorMessage(error);
  return /not connected|keepalive timeout|econnreset|epipe|etimedout|econnrefused|ssh-команда превысила|ssh-опрос превысил/i.test(
    message,
  );
}

export function shouldRetrySshPoll(error: unknown, alreadyRetried: boolean): boolean {
  if (alreadyRetried || isCollectorError(error) || isSshAuthError(error) || isSshSessionRevokedError(error)) {
    return false;
  }
  return isSshTransportError(error);
}

export function canCommitPoll(input: {
  stopping: boolean;
  startedEpoch: number | null;
  currentEpoch: number | null;
}): boolean {
  if (input.stopping) {
    return false;
  }
  if (input.startedEpoch === null || input.currentEpoch === null) {
    return false;
  }
  return input.startedEpoch === input.currentEpoch;
}
