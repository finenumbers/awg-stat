"use client";

import { useState } from "react";

import { ServerIdentityForm } from "@/components/servers/server-identity-form";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

export function ServerSettingsDialog({
  serverId,
  username,
  authMethod,
}: {
  serverId: string;
  username: string;
  authMethod: string;
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
        description={`SSH ${username}. Данные только для этого сервера, не из общих Настроек.`}
      >
        <ServerIdentityForm
          key={`${open}-${username}-${authMethod}`}
          serverId={serverId}
          username={username}
          authMethod={authMethod}
          onSaved={() => setOpen(false)}
        />
      </Dialog>
    </>
  );
}
