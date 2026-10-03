import { AppSidebar } from "@/components/layout/app-sidebar";
import { LiveRefresh } from "@/components/layout/live-refresh";
import { requireSession } from "@/lib/session";
import { getAwgNavState } from "@/server/services/awg-client.service";
import { listServerNavItems } from "@/server/services/server.service";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireSession();
  const [servers, awgState] = await Promise.all([listServerNavItems(), getAwgNavState()]);
  return (
    <div className="flex min-h-svh">
      <LiveRefresh />
      <AppSidebar servers={servers} awgState={awgState} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
