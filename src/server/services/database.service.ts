import { db } from "@/lib/db";

export async function getDatabaseSizeBytes(): Promise<bigint> {
  const rows = await db.$queryRaw<Array<{ size: bigint }>>`
    SELECT pg_database_size(current_database()) AS size
  `;
  return rows[0]?.size ?? 0n;
}
