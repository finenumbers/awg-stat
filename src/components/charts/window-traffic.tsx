import { RX_COLOR, TX_COLOR } from "@/lib/traffic-colors";
import { formatBytes } from "@/lib/utils";

export function WindowTrafficValues({ rx, tx }: { rx: bigint | number; tx: bigint | number }) {
  return (
    <>
      исходящий:{" "}
      <span className="font-bold tabular-nums" style={{ color: RX_COLOR }}>
        {formatBytes(rx)}
      </span>
      , входящий:{" "}
      <span className="font-bold tabular-nums" style={{ color: TX_COLOR }}>
        {formatBytes(tx)}
      </span>
    </>
  );
}
