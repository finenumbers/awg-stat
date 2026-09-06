import { AppSidebar } from "@/components/layout/app-sidebar";
import { LiveRefresh } from "@/components/layout/live-refresh";
import { requireSession } from "@/lib/session";
import { listServerNavItems } from "@/server/services/server.service";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireSession();
  const servers = await listServerNavItems();
  return (
    <div className="flex min-h-svh">
      <LiveRefresh />
      <AppSidebar servers={servers} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
