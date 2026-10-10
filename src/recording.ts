import {
  qualifiedKey,
  type CatalogSymbol,
  type Sample,
  type ProviderMessage,
} from "./provider";
import type { Sim } from "./model";
export type LogFrame = {
  sequence: number;
  timeMs: number;
  hostReceivedAtUtc: string | null;
  samples: Sample[];
};
export const CSV_HEADER =
  "csv_text_encoding,protocol_version,epoch,catalog_revision,sequence,elapsed_simulation_ms,host_received_at_utc,source_id,symbol_path,type,value,units,quality,reason\r\n";
export function encodeCsvText(value: string) {
  return /^(?:'|\s*[=+\-@])/.test(value) ? "'" + value : value;
}
export function decodeCsvText(value: string) {
  return value.startsWith("'") ? value.slice(1) : value;
}
export function csvCell(value: string | number | boolean | null) {
  if (value === null) return "";
  if (typeof value !== "string") return String(value);
  return '"' + encodeCsvText(value).replaceAll('"', '""') + '"';
}
export function frameCsv(
  frame: LogFrame,
  catalog: CatalogSymbol[],
  epoch: number,
  catalogRevision: number,
) {
  return frame.samples
    .map((sample) => {
      const symbol = catalog.find(
        (c) =>
          c.sourceId === sample.sourceId && c.symbolPath === sample.symbolPath,
      );
      return (
        [
          "spreadsheet-safe-v1",
          1,
          epoch,
          catalogRevision,
          frame.sequence,
          frame.timeMs,
          frame.hostReceivedAtUtc ?? "",
          sample.sourceId,
          sample.symbolPath,
          sample.type,
          sample.value,
          symbol?.units ?? "",
          sample.quality,
          sample.reason ?? "",
        ]
          .map(csvCell)
          .join(",") + "\r\n"
      );
    })
    .join("");
}
export function batchLogFrame(
  message: Extract<ProviderMessage, { kind: "sampleBatch" }>,
  catalog: CatalogSymbol[],
  receivedAt = new Date().toISOString(),
): LogFrame {
  return {
    sequence: message.sequence,
    timeMs: message.timeMs,
    hostReceivedAtUtc: receivedAt,
    samples: catalog.map(
      (c) =>
        message.samples.find(
          (s) => s.sourceId === c.sourceId && s.symbolPath === c.symbolPath,
        ) ?? {
          sourceId: c.sourceId,
          symbolPath: c.symbolPath,
          type: c.type,
          value: null,
          quality: "unresolved",
          reason: "Missing variable in accepted frame",
        },
    ),
  };
}
export function historyCsv(sim: Sim, catalog: CatalogSymbol[]) {
  return (
    CSV_HEADER +
    (sim.frames ?? [])
      .map((f) =>
        frameCsv(
          {
            sequence: f.sequence,
            timeMs: f.sessionTimeMs,
            hostReceivedAtUtc: f.hostReceivedAtUtc ?? null,
            samples: catalog.map((c) => {
              const key = qualifiedKey(c.sourceId, c.symbolPath),
                quality = f.quality[key] ?? "unresolved";
              return {
                sourceId: c.sourceId,
                symbolPath: c.symbolPath,
                type: c.type,
                value: quality === "good" ? (f.values[key] ?? null) : null,
                quality,
                reason: f.reasons?.[key],
              };
            }),
          },
          catalog,
          f.epoch ?? sim.epoch,
          f.catalogRevision ?? sim.catalogRevision ?? 1,
        ),
      )
      .join("")
  );
}
export type RecordingSink = {
  append: (frames: LogFrame[]) => Promise<void>;
  finish: () => Promise<void>;
};
const size = (s: string) => new TextEncoder().encode(s).length;
/** Accepted frames drain on admission overflow; failed/uncertain sink operations never retry. */
export class Recorder {
  private queue: { frame: LogFrame; bytes: number; csvBytes: number }[] = [];
  private bytes = 0;
  private inFlight: Promise<void> | null = null;
  private accepting = true;
  private failure: Error | null = null;
  private sinkFailed = false;
  private stopped: Promise<void> | null = null;
  readonly limit = 2 * 1024 * 1024;
  constructor(
    private sink: RecordingSink,
    private notify: (status: string) => void,
    private catalog: CatalogSymbol[],
    private epoch: number,
    private catalogRevision: number,
    private timeoutMs = 5000,
  ) {}
  get queuedBytes() {
    return this.bytes;
  }
  append(frame: LogFrame) {
    if (!this.accepting) return;
    const bytes = size(JSON.stringify(frame)),
      csvBytes = size(
        frameCsv(frame, this.catalog, this.epoch, this.catalogRevision),
      );
    if (
      bytes + 2 > 128 * 1024 ||
      csvBytes > 128 * 1024 ||
      frame.samples.length > 256 ||
      this.bytes + bytes > this.limit
    ) {
      this.accepting = false;
      this.failure = new Error(
        "Recording admission limit exceeded: unrecorded frame; partial recording, acquisition continues",
      );
      this.notify(this.failure.message);
      return;
    }
    this.queue.push({ frame, bytes, csvBytes });
    this.bytes += bytes;
    this.pump();
  }
  private async bounded(operation: () => Promise<void>, label: string) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.resolve().then(operation),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(
                  label + " outcome unknown: partial file, no automatic retry",
                ),
              ),
            this.timeoutMs,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  private pump() {
    if (this.inFlight || this.sinkFailed || !this.queue.length) return;
    const frames: LogFrame[] = [];
    let rows = 0,
      bytes = 2,
      csvBytes = 0;
    while (this.queue.length) {
      const next = this.queue[0],
        nextBytes = bytes + next.bytes + (frames.length ? 1 : 0);
      if (
        nextBytes > 128 * 1024 ||
        csvBytes + next.csvBytes > 128 * 1024 ||
        rows + next.frame.samples.length > 256
      )
        break;
      this.queue.shift();
      this.bytes -= next.bytes;
      bytes = nextBytes;
      csvBytes += next.csvBytes;
      rows += next.frame.samples.length;
      frames.push(next.frame);
    }
    this.inFlight = this.bounded(
      () => this.sink.append(frames),
      "Recording chunk",
    )
      .catch((error) => {
        this.failure =
          error instanceof Error ? error : new Error(String(error));
        this.sinkFailed = true;
        this.accepting = false;
        this.queue = [];
        this.bytes = 0;
        this.notify("Recording failed: " + this.failure.message);
      })
      .finally(() => {
        this.inFlight = null;
        this.pump();
      });
  }
  stop() {
    return (this.stopped ??= this.finish());
  }
  private async finish() {
    this.accepting = false;
    while (this.inFlight || (this.queue.length && !this.sinkFailed)) {
      if (!this.inFlight) this.pump();
      await this.inFlight;
    }
    try {
      await this.bounded(() => this.sink.finish(), "Recording flush");
    } catch (error) {
      this.failure = error instanceof Error ? error : new Error(String(error));
      this.notify("Recording failed: " + this.failure.message);
    }
    if (this.failure) throw this.failure;
    this.notify("Recording stopped and flushed");
  }
}
