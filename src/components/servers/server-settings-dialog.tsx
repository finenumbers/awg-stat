"use client";

import { useState } from "react";

import { ServerAccessForm } from "@/components/servers/server-access-form";
import { ServerIdentityForm } from "@/components/servers/server-identity-form";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

export function ServerSettingsDialog({
  serverId,
  username,
  authMethod,
  host,
  port,
  accessViaAwg,
}: {
  serverId: string;
  username: string;
  authMethod: string;
  host: string;
  port: number;
  accessViaAwg: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        Настройки
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Настройки сервера"
        description={`SSH ${username}. Адрес и маршрут проверяются до сохранения.`}
      >
        <div className="space-y-6">
          <ServerAccessForm
            key={`${open}-${host}-${port}-${accessViaAwg}`}
            serverId={serverId}
            host={host}
            port={port}
            accessViaAwg={accessViaAwg}
            onSaved={() => setOpen(false)}
          />
          <ServerIdentityForm
            key={`${open}-${username}-${authMethod}`}
            serverId={serverId}
            username={username}
            authMethod={authMethod}
            onSaved={() => setOpen(false)}
          />
        </div>
      </Dialog>
    </>
  );
}
