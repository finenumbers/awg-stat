"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { SshFields } from "@/components/settings/identity-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createServerAction } from "@/server/actions/servers";

export function ServerForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const result = await createServerAction(new FormData(event.currentTarget));
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push(result.data ? `/servers/${result.data.id}` : "/");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="w-full space-y-5">
      <div className="space-y-2">
        <Label htmlFor="name">Название</Label>
        <Input id="name" name="name" required />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2 space-y-2">
          <Label htmlFor="host">Хост</Label>
          <Input id="host" name="host" placeholder="vpn.example.com" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="port">SSH-порт</Label>
          <Input id="port" name="port" type="number" defaultValue={22} required />
        </div>
      </div>
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">SSH этого сервера</legend>
        <p className="text-sm text-muted-foreground">
          Учётные данные хранятся только у этого сервера. Позже их можно сменить в Настройках карточки.
        </p>
        <SshFields />
      </fieldset>
      <p className="text-sm text-muted-foreground">
        Gate подключится к уже запущенному контейнеру amnezia-awg2. Ничего не будет установлено и не будет изменено.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={loading}>
        {loading ? "Проверка существующей установки…" : "Подключить"}
      </Button>
    </form>
  );
}
