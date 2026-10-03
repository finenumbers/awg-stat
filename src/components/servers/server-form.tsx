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
  const [connection, setConnection] = useState<"SSH" | "LOCAL_DOCKER">("SSH");
  const local = connection === "LOCAL_DOCKER";

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
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Подключение</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="connection"
            value="SSH"
            checked={connection === "SSH"}
            onChange={() => setConnection("SSH")}
          />
          По SSH
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="connection"
            value="LOCAL_DOCKER"
            checked={connection === "LOCAL_DOCKER"}
            onChange={() => setConnection("LOCAL_DOCKER")}
          />
          На этом хосте
        </label>
      </fieldset>
      <div className={local ? "space-y-2" : "grid grid-cols-3 gap-3"}>
        <div className={local ? "space-y-2" : "col-span-2 space-y-2"}>
          <Label htmlFor="host">{local ? "Публичный адрес" : "Хост"}</Label>
          <Input id="host" name="host" placeholder="vpn.example.com" required />
          {local ? (
            <p className="text-sm text-muted-foreground">
              Адрес нужен для ping и проверки блокировки. Amnezia на этом компьютере читается через Docker, SSH не
              используется. Ping своего публичного адреса с этого же сервера может не вернуться.
            </p>
          ) : null}
        </div>
        {local ? null : (
          <div className="space-y-2">
            <Label htmlFor="port">SSH-порт</Label>
            <Input id="port" name="port" type="number" defaultValue={22} required />
          </div>
        )}
      </div>
      {local ? null : (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Маршрут до этого узла</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="accessViaAwg" value="0" defaultChecked />
            Напрямую
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="accessViaAwg" value="1" />
            Через AmneziaWG
          </label>
          <p className="text-sm text-muted-foreground">
            Через туннель пойдут только SSH и проверка доступности этого хоста. Клиент настраивается в разделе AmneziaWG.
          </p>
        </fieldset>
      )}
      {local ? null : (
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">SSH этого сервера</legend>
          <p className="text-sm text-muted-foreground">
            Учётные данные хранятся только у этого сервера. Позже их можно сменить в Настройках карточки.
          </p>
          <SshFields />
        </fieldset>
      )}
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
