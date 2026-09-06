import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { getEncryptionKey } from "@/lib/env";

export type CredentialPayload = {
  password?: string;
  privateKey?: string;
  passphrase?: string;
};

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

export type EncryptedBlob = {
  encryptedData: string;
  iv: string;
  authTag: string;
  keyVersion: number;
};

export function encryptCredential(payload: CredentialPayload): EncryptedBlob {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const plaintext = JSON.stringify(payload);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);

  return {
    encryptedData: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    keyVersion: 1,
  };
}

export function decryptCredential(blob: EncryptedBlob): CredentialPayload {
  const key = getEncryptionKey();
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(blob.iv, "base64"));
  decipher.setAuthTag(Buffer.from(blob.authTag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(blob.encryptedData, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString("utf8")) as CredentialPayload;
}
