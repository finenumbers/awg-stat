"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { signOut } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

type NavServer = { id: string; name: string };

function isServerActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebar({ servers }: { servers: NavServer[] }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <aside className="sticky top-0 flex h-svh w-[200px] shrink-0 flex-col self-start border-r bg-card px-4 py-6">
      <Link href="/" className="flex justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/fine-numbers.png"
          alt="fine numbers"
          width={1024}
          height={273}
          className="h-auto w-full"
        />
      </Link>
      <nav className="mt-8 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {servers.map((server) => {
          const href = `/servers/${server.id}`;
          return (
            <Link
              key={server.id}
              href={href}
              title={server.name}
              className={cn(
                "block truncate rounded-md px-3 py-2 text-sm font-bold text-black",
                isServerActive(pathname, href) ? "bg-secondary" : "hover:bg-accent",
              )}
            >
              {server.name}
            </Link>
          );
        })}
      </nav>
      <div className="mt-2 flex flex-col gap-1">
        <Link
          href="/servers/new"
          className={cn(
            "rounded-md px-3 py-2 text-sm",
            pathname === "/servers/new" ? "bg-secondary font-medium" : "text-muted-foreground hover:bg-accent",
          )}
        >
          Добавить сервер
        </Link>
        <button
          type="button"
          className="rounded-md px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent"
          onClick={async () => {
            await signOut();
            router.push("/login");
            router.refresh();
          }}
        >
          Выйти
        </button>
      </div>
    </aside>
  );
}
