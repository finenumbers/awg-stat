import { RX_COLOR, TX_COLOR } from "@/lib/traffic-colors";
import { formatBytes } from "@/lib/utils";

export function WindowTrafficValues({
  rx,
  tx,
  rxLabel = "Исх.:",
  txLabel = "Вх.:",
}: {
  rx: bigint | number;
  tx: bigint | number;
  rxLabel?: string;
  txLabel?: string;
}) {
  return (
    <>
      {rxLabel}{" "}
      <span className="font-bold tabular-nums" style={{ color: RX_COLOR }}>
        {formatBytes(rx)}
      </span>
      , {txLabel}{" "}
      <span className="font-bold tabular-nums" style={{ color: TX_COLOR }}>
        {formatBytes(tx)}
      </span>
    </>
  );
}
