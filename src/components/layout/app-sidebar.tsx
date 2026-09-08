"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { signOut } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

type NavServer = { id: string; name: string };

const SIDEBAR_WIDTH_LABEL = "Великобритания";

function isServerActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebar({ servers }: { servers: NavServer[] }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <aside className="sticky top-0 flex h-svh w-max shrink-0 flex-col self-start border-r bg-card px-3 py-4">
      <div className="flex min-h-0 w-max flex-1 flex-col">
        <span
          aria-hidden
          className="block h-0 overflow-hidden whitespace-nowrap px-2 text-sm font-bold"
        >
          {SIDEBAR_WIDTH_LABEL}
        </span>
        <div className="flex min-h-0 w-0 min-w-full flex-1 flex-col">
          <Link href="/" className="block px-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/fine-numbers.png"
              alt="fine numbers"
              width={1024}
              height={273}
              className="h-auto w-full"
            />
          </Link>
          <nav className="mt-4 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
            {servers.map((server) => {
              const href = `/servers/${server.id}`;
              const active = isServerActive(pathname, href);
              return (
                <Link
                  key={server.id}
                  href={href}
                  title={server.name}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "block w-full truncate rounded-md px-2 py-1.5 text-sm font-bold transition-colors",
                    active
                      ? "bg-black text-white hover:bg-black hover:text-white"
                      : "text-black hover:bg-muted",
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
              aria-current={pathname === "/servers/new" ? "page" : undefined}
              className={cn(
                "block w-full rounded-md px-2 py-1.5 text-sm transition-colors",
                pathname === "/servers/new"
                  ? "bg-black font-bold text-white hover:bg-black hover:text-white"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              Добавить
            </Link>
            <button
              type="button"
              className="w-full rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted"
              onClick={async () => {
                await signOut();
                router.push("/login");
                router.refresh();
              }}
            >
              Выйти
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
