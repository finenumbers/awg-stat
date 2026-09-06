import { redirect } from "next/navigation";
import { Suspense } from "react";

import { LoginForm } from "@/components/auth/login-form";
import { isSetupRequired } from "@/server/services/setup.service";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await isSetupRequired()) {
    redirect("/setup");
  }
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
