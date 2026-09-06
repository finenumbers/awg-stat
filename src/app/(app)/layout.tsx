import { AppSidebar } from "@/components/layout/app-sidebar";
import { LiveRefresh } from "@/components/layout/live-refresh";
import { requireSession } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireSession();
  return (
    <div className="flex min-h-screen">
      <LiveRefresh />
      <AppSidebar />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
