"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Обзор" },
  { href: "/servers/new", label: "Добавить сервер" },
];

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r bg-card px-4 py-6">
      <div className="px-2">
        <p className="text-lg font-semibold tracking-tight">Gate</p>
        <p className="mt-1 text-xs text-muted-foreground">Только чтение AmneziaVPN</p>
      </div>
      <nav className="mt-8 flex flex-1 flex-col gap-1">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "rounded-md px-3 py-2 text-sm",
              pathname === link.href ? "bg-secondary font-medium" : "text-muted-foreground hover:bg-accent",
            )}
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <Button
        variant="ghost"
        className="justify-start"
        onClick={async () => {
          await signOut();
          router.push("/login");
          router.refresh();
        }}
      >
        Выйти
      </Button>
    </aside>
  );
}
