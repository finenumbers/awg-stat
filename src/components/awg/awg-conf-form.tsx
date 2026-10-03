"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { deleteAwgConfAction, saveAwgConfAction } from "@/server/actions/awg";

const MAX_BYTES = 16 * 1024;

export function AwgConfForm({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [conf, setConf] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const result = await saveAwgConfAction(new FormData(event.currentTarget));
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setConf("");
    router.refresh();
  }

  async function onDelete() {
    setLoading(true);
    setError(null);
    const result = await deleteAwgConfAction();
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setConf("");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="awg-file" className="text-sm font-medium">
          Файл из AmneziaVPN
        </label>
        <input
          id="awg-file"
          type="file"
          accept=".conf,text/plain"
          className="block w-full text-sm"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) {
              return;
            }
            if (file.size > MAX_BYTES) {
              setError("Файл конфига больше 16 КБ");
              return;
            }
            void file.text().then((text) => {
              setConf(text);
              setError(null);
            });
          }}
        />
        <p className="text-sm text-muted-foreground">
          Один интерфейс. Конфиг можно заменить новым файлом. Приватный ключ после сохранения в браузер не возвращается.
        </p>
      </div>
      <textarea
        name="conf"
        value={conf}
        onChange={(event) => setConf(event.target.value)}
        required
        spellCheck={false}
        placeholder="[Interface] ..."
        className="flex min-h-48 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={loading}>
          {loading ? "Применение…" : configured ? "Заменить конфиг" : "Подключить"}
        </Button>
        {configured ? (
          <Button type="button" variant="outline" disabled={loading} onClick={() => void onDelete()}>
            Отключить
          </Button>
        ) : null}
      </div>
    </form>
  );
}
