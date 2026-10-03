import { AwgConfForm } from "@/components/awg/awg-conf-form";
import { AWG_HANDSHAKE_FRESH_SEC } from "@/lib/awg/conf";
import { formatBytes, formatDateTime } from "@/lib/utils";
import { getAwgClientView } from "@/server/services/awg-client.service";

export const dynamic = "force-dynamic";

function statusLabel(view: Awaited<ReturnType<typeof getAwgClientView>>): { text: string; tone: string } {
  if (!view.configured) {
    return { text: "не настроен", tone: "bg-zinc-100 text-zinc-700" };
  }
  if (!view.status) {
    return { text: "контейнер недоступен", tone: "bg-red-100 text-red-800" };
  }
  if (view.applyError || view.status.applyError || !view.status.up) {
    return { text: "туннель не поднят", tone: "bg-amber-100 text-amber-900" };
  }
  const fresh =
    view.status.handshakeAt !== null && Date.now() / 1000 - view.status.handshakeAt <= AWG_HANDSHAKE_FRESH_SEC;
  if (!fresh) {
    return { text: "нет рукопожатия", tone: "bg-amber-100 text-amber-900" };
  }
  return { text: "подключен", tone: "bg-emerald-100 text-emerald-800" };
}

export default async function AwgPage() {
  const view = await getAwgClientView();
  const status = statusLabel(view);
  const error = view.applyError || view.status?.applyError;

  return (
    <main className="w-full max-w-3xl space-y-6 p-8">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold tracking-tight">AmneziaWG</h1>
          <span className={`rounded-full px-2 py-0.5 text-xs ${status.tone}`}>{status.text}</span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Один клиентский туннель для доступа Gate к выбранным узлам. Остальной трафик контейнеров идёт напрямую.
          Рукопожатие означает связь с VPN-сервером, не доступность конкретного узла.
        </p>
      </div>
      {view.configured ? (
        <dl className="grid grid-cols-[10rem_1fr] gap-y-1 text-sm">
          <dt className="text-muted-foreground">Endpoint</dt>
          <dd>
            {view.endpointHost}:{view.endpointPort}
          </dd>
          <dt className="text-muted-foreground">Адрес клиента</dt>
          <dd>{view.clientAddress}</dd>
          <dt className="text-muted-foreground">Public key</dt>
          <dd className="break-all font-mono text-xs">{view.peerPublicKey}</dd>
          <dt className="text-muted-foreground">Клиент</dt>
          <dd>{view.status?.version ?? "—"}</dd>
          <dt className="text-muted-foreground">Принято / отправлено</dt>
          <dd>
            {view.status?.up ? `${formatBytes(view.status.rx)} / ${formatBytes(view.status.tx)}` : "—"}
          </dd>
          <dt className="text-muted-foreground">Обновлён</dt>
          <dd>{view.updatedAt ? formatDateTime(view.updatedAt) : "—"}</dd>
        </dl>
      ) : null}
      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>
      ) : null}
      <AwgConfForm configured={view.configured} />
    </main>
  );
}
