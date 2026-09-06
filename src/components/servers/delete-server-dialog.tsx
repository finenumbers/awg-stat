"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { deleteServerAction } from "@/server/actions/servers";

export function DeleteServerDialog({ serverId, serverName }: { serverId: string; serverName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    if (loading) {
      return;
    }
    setOpen(false);
    setError(null);
  }

  async function onConfirm() {
    setLoading(true);
    setError(null);
    const result = await deleteServerAction(serverId);
    if (!result.ok) {
      setLoading(false);
      setError(result.error);
      return;
    }
    const name = result.data?.name || serverName;
    router.push(`/?deleted=${encodeURIComponent(name)}`);
    router.refresh();
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        Удалить
      </Button>
      <Dialog
        open={open}
        onClose={close}
        closeDisabled={loading}
        title={`Удалить сервер «${serverName}»?`}
        description="Действие необратимо. Из проекта будут удалены все связанные данные этого сервера."
      >
        <div className="space-y-4">
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>SSH-доступ и секреты</li>
            <li>метаданные VPN-инстанса</li>
            <li>пиры и история трафика</li>
            <li>события присутствия</li>
          </ul>
          <p className="text-sm text-muted-foreground">
            Сам AmneziaVPN на хосте не изменяется: контейнер, конфиг и клиенты остаются как есть.
          </p>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={close} disabled={loading}>
              Отмена
            </Button>
            <Button type="button" variant="destructive" onClick={onConfirm} disabled={loading}>
              {loading ? "Удаляем и проверяем данные…" : "Удалить все данные"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
