import { PeersMatrixTable } from "@/components/peers/peers-matrix-table";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listPeersTrafficMatrix } from "@/server/services/server.service";

export const dynamic = "force-dynamic";

export default async function PeersPage() {
  const matrix = await listPeersTrafficMatrix();

  return (
    <main className="w-full space-y-6 p-8">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Пиры</h1>
        <p className="mt-1 text-sm text-muted-foreground">Трафик за 30 дней</p>
      </div>

      {matrix.servers.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Нет серверов</CardTitle>
            <CardDescription>
              Подключите существующую установку AmneziaWG 3.1, чтобы увидеть пиров по всем серверам.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : matrix.rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Нет пиров</CardTitle>
            <CardDescription>Имена появятся после успешного опроса clientsTable на подключённых серверах.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <PeersMatrixTable matrix={matrix} />
      )}
    </main>
  );
}
