import { ServerForm } from "@/components/servers/server-form";

export const dynamic = "force-dynamic";

export default async function NewServerPage() {
  return (
    <main className="w-full space-y-6 p-8">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Подключить сервер</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Только обнаружение уже установленного AmneziaVPN. SSH-доступ задаётся только для этого сервера.
        </p>
      </div>
      <ServerForm />
    </main>
  );
}
