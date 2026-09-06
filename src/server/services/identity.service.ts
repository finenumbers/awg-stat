import type { AuthMethod } from "@prisma/client";

import { decryptCredential, encryptCredential } from "@/lib/crypto";
import { db } from "@/lib/db";
import type { CredentialPayload } from "@/lib/crypto";
import type { SshAuthInput, SshAuthUpdateInput } from "@/lib/validations/identity";
import { createAuditEvent } from "@/server/services/audit.service";

export async function getServerSecret(serverId: string): Promise<CredentialPayload> {
  const cred = await db.serverCredential.findUnique({ where: { serverId } });
  if (!cred) {
    throw new Error("Секрет SSH этого сервера не найден");
  }
  return decryptCredential(cred);
}

export async function writeServerCredential(serverId: string, input: SshAuthInput | SshAuthUpdateInput) {
  const blob = encryptCredential({
    password: input.password,
    privateKey: input.privateKey,
    passphrase: input.passphrase,
  });
  await db.serverCredential.upsert({
    where: { serverId },
    update: blob,
    create: { serverId, ...blob },
  });
}

export async function updateServerSsh(serverId: string, input: SshAuthUpdateInput, userId: string) {
  const server = await db.server.findUnique({ where: { id: serverId } });
  if (!server) {
    throw new Error("Сервер не найден");
  }

  const hasNewSecret = Boolean(input.password || input.privateKey);
  if (hasNewSecret) {
    await writeServerCredential(serverId, input);
  }

  await db.server.update({
    where: { id: serverId },
    data: {
      sshUsername: input.username,
      sshAuthMethod: input.authMethod as AuthMethod,
    },
  });

  await createAuditEvent({
    userId,
    action: "SERVER_UPDATED",
    entityType: "server",
    entityId: serverId,
    metadata: { sshUsername: input.username },
  });
}
