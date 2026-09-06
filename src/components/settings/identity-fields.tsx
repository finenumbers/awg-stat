"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SshFields({
  idPrefix = "",
  defaultUsername,
  defaultMethod = "PASSWORD",
  secretRequired = true,
}: {
  idPrefix?: string;
  defaultUsername?: string;
  defaultMethod?: string;
  secretRequired?: boolean;
}) {
  const [method, setMethod] = useState(defaultMethod);
  const userId = `${idPrefix}username`;
  const methodId = `${idPrefix}authMethod`;

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor={userId}>SSH-пользователь</Label>
        <Input id={userId} name="username" defaultValue={defaultUsername} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor={methodId}>Метод</Label>
        <select
          id={methodId}
          name="authMethod"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={method}
          onChange={(event) => setMethod(event.target.value)}
        >
          <option value="PASSWORD">Пароль</option>
          <option value="PRIVATE_KEY">Ключ</option>
          <option value="PRIVATE_KEY_WITH_PASSPHRASE">Ключ с паролем</option>
        </select>
      </div>
      {method === "PASSWORD" ? (
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}password`}>Пароль{secretRequired ? "" : " (оставьте пустым, чтобы не менять)"}</Label>
          <Input id={`${idPrefix}password`} name="password" type="password" />
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}privateKey`}>
              Закрытый ключ{secretRequired ? "" : " (оставьте пустым, чтобы не менять)"}
            </Label>
            <textarea
              id={`${idPrefix}privateKey`}
              name="privateKey"
              rows={5}
              className="w-full rounded-md border border-input bg-background p-2 font-mono text-xs"
            />
          </div>
          {method === "PRIVATE_KEY_WITH_PASSPHRASE" && (
            <div className="space-y-2">
              <Label htmlFor={`${idPrefix}passphrase`}>Пароль ключа</Label>
              <Input id={`${idPrefix}passphrase`} name="passphrase" type="password" />
            </div>
          )}
        </>
      )}
    </div>
  );
}
