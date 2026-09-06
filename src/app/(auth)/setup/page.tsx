import { redirect } from "next/navigation";

import { SetupForm } from "@/components/auth/setup-form";
import { isSetupRequired } from "@/server/services/setup.service";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (!(await isSetupRequired())) {
    redirect("/login");
  }
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <SetupForm />
    </main>
  );
}
