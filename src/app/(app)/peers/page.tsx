import { PeersMatrixView } from "@/components/peers/peers-matrix-view";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { serializePeersMatrix } from "@/lib/peers-matrix";
import { listPeersTrafficMatrix } from "@/server/services/server.service";

export const dynamic = "force-dynamic";

export default async function PeersPage() {
  const matrices = await listPeersTrafficMatrix();
  const current = matrices["30m"];

  return (
    <main className="w-full space-y-6 p-8">
      {current.servers.length === 0 ? (
        <>
          <h1 className="text-lg font-semibold tracking-tight">Пиры</h1>
          <Card>
            <CardHeader>
              <CardTitle>Нет серверов</CardTitle>
              <CardDescription>
                Подключите существующую установку AmneziaWG 3.1, чтобы увидеть пиров по всем серверам.
              </CardDescription>
            </CardHeader>
          </Card>
        </>
      ) : current.rows.length === 0 ? (
        <>
          <h1 className="text-lg font-semibold tracking-tight">Пиры</h1>
          <Card>
            <CardHeader>
              <CardTitle>Нет пиров</CardTitle>
              <CardDescription>Имена появятся после успешного опроса clientsTable на подключённых серверах.</CardDescription>
            </CardHeader>
          </Card>
        </>
      ) : (
        <PeersMatrixView
          windows={{
            "30m": serializePeersMatrix(matrices["30m"]),
            "24h": serializePeersMatrix(matrices["24h"]),
            "30d": serializePeersMatrix(matrices["30d"]),
          }}
        />
      )}
    </main>
  );
}
