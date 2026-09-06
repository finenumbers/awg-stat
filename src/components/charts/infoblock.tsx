import { type ReactNode } from "react";

import { cn } from "@/lib/utils";

export const INFOBLOCK_CHROME = "rounded-lg border bg-card p-6 text-card-foreground shadow-sm";

export function InfoblockBody({
  label,
  value,
  caption,
  mutedClassName = "text-muted-foreground",
}: {
  label: ReactNode;
  value: ReactNode;
  caption: ReactNode;
  mutedClassName?: string;
}) {
  return (
    <>
      <p className={cn("text-sm", mutedClassName)}>{label}</p>
      <p className="mt-1.5 text-2xl font-semibold leading-none tracking-tight tabular-nums">{value}</p>
      <p className={cn("mt-4 text-sm", mutedClassName)}>{caption}</p>
    </>
  );
}
