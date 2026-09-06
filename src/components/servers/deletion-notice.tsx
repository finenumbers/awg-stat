"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export function DeletionNotice() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    const raw = searchParams.get("deleted");
    if (!raw) {
      return;
    }
    setName(raw);
    router.replace("/");
  }, [router, searchParams]);

  if (!name) {
    return null;
  }

  return (
    <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
      Сервер «{name}» удалён. Все связанные данные проекта удалены.
    </p>
  );
}
