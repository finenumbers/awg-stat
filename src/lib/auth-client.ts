import { createAuthClient } from "better-auth/react";

import { getPublicAppUrl } from "@/lib/app-url";

function getAuthBaseURL(): string {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return getPublicAppUrl();
}

const authClient = createAuthClient({
  baseURL: getAuthBaseURL(),
});

export const { signIn, signOut, signUp } = authClient;
