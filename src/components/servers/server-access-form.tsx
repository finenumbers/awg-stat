"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateServerAccessAction } from "@/server/actions/servers";

export function ServerAccessForm({
  serverId,
  host,
  port,
  accessViaAwg,
  onSaved,
}: {
  serverId: string;
  host: string;
  port: number;
  accessViaAwg: boolean;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [viaAwg, setViaAwg] = useState(accessViaAwg);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const result = await updateServerAccessAction(serverId, new FormData(event.currentTarget));
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
    onSaved?.();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2 space-y-2">
          <Label htmlFor="access-host">Хост</Label>
          <Input id="access-host" name="host" defaultValue={host} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="access-port">SSH-порт</Label>
          <Input id="access-port" name="port" type="number" defaultValue={port} required />
        </div>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Маршрут</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="accessViaAwg"
            value="0"
            checked={!viaAwg}
            onChange={() => setViaAwg(false)}
          />
          Напрямую
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="accessViaAwg" value="1" checked={viaAwg} onChange={() => setViaAwg(true)} />
          Через AmneziaWG
        </label>
      </fieldset>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={loading}>
        {loading ? "Проверка маршрута…" : "Сохранить адрес"}
      </Button>
    </form>
  );
}
