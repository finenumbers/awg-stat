import type { SyncHostFingerprintVerifier } from "ssh2";

export function createHostKeyVerifier(expectedFingerprint?: string | null): {
  verifier: SyncHostFingerprintVerifier;
  getCaptured: () => string | null;
} {
  let capturedFingerprint: string | null = null;

  const verifier: SyncHostFingerprintVerifier = (fingerprint: string) => {
    if (!expectedFingerprint) {
      capturedFingerprint = fingerprint;
      return true;
    }
    return fingerprint === expectedFingerprint;
  };

  return {
    verifier,
    getCaptured: () => capturedFingerprint,
  };
}
