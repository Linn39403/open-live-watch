import { initialSim, type Sim, type Source } from "./model";
import {
  validateMessage,
  newRuntime,
  catalogFor,
  writeRuntime,
  stepRuntime,
  messageBase,
  qualifiedKey,
  type ProviderMessage,
} from "./provider";
/** Pure worker engine, also used by boundary/command regression tests. */
export class OfflineEngine {
  state: Sim = initialSim();
  sources: Source[] = [];
  private operationCounter = 0;
  receive(input: unknown): ProviderMessage[] {
    const m = validateMessage(input);
    if (m.kind === "configure") {
      if (
        m.epoch < this.state.epoch ||
        m.catalogRevision < (this.state.catalogRevision ?? 0)
      )
        return [];
      const fresh =
        m.epoch !== this.state.epoch ||
        m.catalogRevision !== this.state.catalogRevision;
      if (!fresh) {
        if (m.commandRevision !== this.state.revision) return [];
        if (JSON.stringify(m.sources) !== JSON.stringify(this.sources))
          throw new Error(
            "Configuration changed without a new session/catalog",
          );
      } else {
        this.state = newRuntime(
          m.sources,
          m.epoch,
          m.catalogRevision,
          m.running,
          m.commandRevision,
        );
        this.operationCounter = 0;
      }
      this.sources = structuredClone(m.sources);
      this.state = { ...this.state, running: m.running };
      return [
        {
          ...messageBase(this.state),
          kind: "catalog",
          symbols: catalogFor(this.sources),
        },
      ];
    }
    if (m.kind !== "write")
      throw new Error("Worker accepts configure/write commands only");
    let status: "acknowledged" | "rejected" = "acknowledged",
      reason = "";
    try {
      if (
        m.epoch !== this.state.epoch ||
        m.catalogRevision !== this.state.catalogRevision
      )
        throw new Error("Stale write session/catalog");
      const parts = /^(0|[1-9][0-9]*):([1-9][0-9]*)$/.exec(m.operationId);
      const counter = parts ? Number(parts[2]) : NaN;
      if (
        !parts ||
        Number(parts[1]) !== m.epoch ||
        !Number.isSafeInteger(counter)
      )
        throw new Error("Invalid monotonic operation identity");
      if (counter <= this.operationCounter)
        throw new Error("Operation already consumed; no replay");
      this.operationCounter = counter;
      if (m.commandRevision !== this.state.revision)
        throw new Error("Stale command revision");
      this.state = writeRuntime(
        this.state,
        this.sources,
        m.sourceId,
        m.symbolPath,
        m.value,
        m.epoch,
        m.catalogRevision,
      );
    } catch (error) {
      status = "rejected";
      reason = String(error);
    }
    return [
      {
        ...messageBase(this.state),
        kind: "writeResult",
        operationId: m.operationId,
        commandRevision: this.state.revision,
        status,
        reason,
        sourceId: m.sourceId,
        symbolPath: m.symbolPath,
        value: status === "acknowledged" ? m.value : null,
      },
    ];
  }
  tick(): ProviderMessage | null {
    if (!this.state.running) return null;
    this.state = stepRuntime(this.state, this.sources);
    const frame = this.state.frames!.at(-1)!;
    return {
      ...messageBase(this.state),
      kind: "sampleBatch",
      commandRevision: this.state.revision,
      sequence: frame.sequence,
      timeMs: frame.sessionTimeMs,
      samples: catalogFor(this.sources).map((c) => ({
        sourceId: c.sourceId,
        symbolPath: c.symbolPath,
        type: c.type,
        value: frame.values[qualifiedKey(c.sourceId, c.symbolPath)],
        quality: "good",
      })),
    };
  }
}
