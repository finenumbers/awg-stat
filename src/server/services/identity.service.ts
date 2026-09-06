import type { AuthMethod, Prisma } from "@prisma/client";

import { decryptCredential, encryptCredential } from "@/lib/crypto";
import { db } from "@/lib/db";
import type { CredentialPayload } from "@/lib/crypto";
import { sshUpdateRequiresSecret, type SshAuthInput, type SshAuthUpdateInput } from "@/lib/validations/identity";
import { createAuditEvent } from "@/server/services/audit.service";

const SSH_METHOD_SECRET_REQUIRED = "Укажите пароль или ключ";

export async function getServerSecret(serverId: string): Promise<CredentialPayload> {
  const cred = await db.serverCredential.findUnique({ where: { serverId } });
  if (!cred) {
    throw new Error("Секрет SSH этого сервера не найден");
  }
  return decryptCredential(cred);
}

export async function writeServerCredential(
  serverId: string,
  input: SshAuthInput | SshAuthUpdateInput,
  client: Pick<Prisma.TransactionClient, "serverCredential"> = db,
) {
  const blob = encryptCredential({
    password: input.password,
    privateKey: input.privateKey,
    passphrase: input.passphrase,
  });
  await client.serverCredential.upsert({
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
  if (sshUpdateRequiresSecret(server.sshAuthMethod, input.authMethod, hasNewSecret)) {
    throw new Error(SSH_METHOD_SECRET_REQUIRED);
  }
  if (hasNewSecret) {
    await writeServerCredential(serverId, input);
  }

  await db.server.update({
    where: { id: serverId },
    data: {
      sshUsername: input.username,
      ...(hasNewSecret ? { sshAuthMethod: input.authMethod as AuthMethod } : {}),
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
