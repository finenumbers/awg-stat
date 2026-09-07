"use client";

import { usePathname, useRouter } from "next/navigation";

import { cn } from "@/lib/utils";

export function ActivePeersToggle({ checked }: { checked: boolean }) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div className="flex shrink-0 items-center gap-2 text-sm font-medium leading-none">
      <span id="active-peers-toggle-label">Активные пиры</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby="active-peers-toggle-label"
        className={cn(
          "relative h-5 w-9 rounded-full transition-colors",
          checked ? "bg-emerald-600" : "bg-zinc-300",
        )}
        onClick={() => {
          router.replace(checked ? `${pathname}?active=0` : pathname);
        }}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-4 rounded-full bg-white transition-transform",
            checked && "translate-x-4",
          )}
        />
      </button>
    </div>
  );
}
