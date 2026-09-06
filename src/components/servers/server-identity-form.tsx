"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { SshFields } from "@/components/settings/identity-fields";
import { Button } from "@/components/ui/button";
import { updateServerSshAction } from "@/server/actions/servers";

export function ServerIdentityForm({
  serverId,
  username,
  authMethod,
  onSaved,
}: {
  serverId: string;
  username: string;
  authMethod: string;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const result = await updateServerSshAction(serverId, new FormData(event.currentTarget));
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
    onSaved?.();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <SshFields defaultUsername={username} defaultMethod={authMethod} secretRequired={false} />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={loading}>
        {loading ? "Сохранение…" : "Сохранить доступ"}
      </Button>
    </form>
  );
}
