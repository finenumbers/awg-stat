import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";

import { getPublicAppUrl } from "@/lib/app-url";
import { db } from "@/lib/db";
import { getAuthSecret } from "@/lib/env";
import { createAuditEvent } from "@/server/services/audit.service";

export const auth = betterAuth({
  baseURL: getPublicAppUrl(),
  secret: getAuthSecret(),
  database: prismaAdapter(db, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 10,
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email") {
        return;
      }
      const userCount = await db.user.count();
      if (userCount > 0) {
        throw new APIError("FORBIDDEN", {
          message: "Регистрация отключена после первоначальной настройки",
        });
      }
    }),
  },
  databaseHooks: {
    user: {
      create: {
        before: async () => {
          const userCount = await db.user.count();
          if (userCount > 0) {
            return false;
          }
        },
      },
    },
    session: {
      create: {
        after: async (session) => {
          await createAuditEvent({
            userId: session.userId,
            action: "LOGIN",
            entityType: "session",
            entityId: session.id,
          });
        },
      },
      delete: {
        after: async (session) => {
          await createAuditEvent({
            userId: session.userId,
            action: "LOGOUT",
            entityType: "session",
            entityId: session.id,
          });
        },
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
