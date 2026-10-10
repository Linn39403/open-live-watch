import {
  initialSim,
  step,
  symbols,
  parseWorkspace,
  type Workspace,
  type Source,
  type Sim,
  type Widget,
} from "./model";
export type CatalogSymbol = {
  sourceId: string;
  symbolPath: string;
  type: "number" | "boolean";
  units: string;
  min: number;
  max: number;
  writable: boolean;
};
export const qualifiedKey = (sourceId: string, symbolPath: string) =>
  JSON.stringify([sourceId, symbolPath]);
export const effectiveRefreshMs = (periodMs: number) =>
  Math.ceil(Math.max(50, periodMs) / 50) * 50;
export function catalogFor(sources: Source[]): CatalogSymbol[] {
  return sources.flatMap((s) =>
    s.provider === "offline"
      ? (s.variables ?? []).map((v) => ({
          sourceId: s.id,
          symbolPath: v.id,
          type: v.type,
          units: v.units,
          min: v.min,
          max: v.max,
          writable: v.writable && v.waveform === "constant",
        }))
      : s.provider === "mock" && s.id === "mock-motor"
        ? symbols.map((v) => ({
            sourceId: s.id,
            symbolPath: v.path,
            type:
              v.type === "bool" ? ("boolean" as const) : ("number" as const),
            units: v.units,
            min: 0,
            max: v.path === "motor.temperature" ? 200 : 3000,
            writable: v.writable,
          }))
        : [],
  );
}
export const compatibleSymbol = (kind: Widget["kind"], symbol: CatalogSymbol) =>
  (symbol.type === "boolean") === ["led", "switch", "button"].includes(kind);
export function newRuntime(
  sources: Source[],
  epoch: number,
  catalogRevision: number,
  running = false,
  revision = 0,
): Sim {
  const state = {
    ...initialSim(),
    epoch,
    catalogRevision,
    running,
    revision,
    frames: [],
  };
  for (const c of catalogFor(sources))
    if (sources.find((s) => s.id === c.sourceId)?.provider === "mock")
      state.values[qualifiedKey(c.sourceId, c.symbolPath)] =
        state.values[c.symbolPath];
  for (const s of sources)
    for (const v of s.variables ?? [])
      state.values[qualifiedKey(s.id, v.id)] = v.initial;
  return state;
}
export function stepRuntime(state: Sim, sources: Source[]): Sim {
  if (!state.running) return state;
  let next = sources.some((s) => s.provider === "mock" && s.id === "mock-motor")
    ? step(state)
    : { ...state, tick: state.tick + 1 };
  const values = { ...next.values };
  const timeMs = next.tick * 50;
  for (const s of sources)
    if (s.provider === "offline")
      for (const v of s.variables ?? []) {
        const phase = (timeMs % v.periodMs) / v.periodMs;
        const key = qualifiedKey(s.id, v.id);
        if (v.waveform === "sine")
          values[key] =
            v.min + ((v.max - v.min) * (1 + Math.sin(phase * 2 * Math.PI))) / 2;
        else if (v.waveform === "ramp")
          values[key] = v.min + (v.max - v.min) * phase;
        else if (v.waveform === "toggle")
          values[key] = phase < 0.5 ? v.initial : !v.initial;
        else if (values[key] === undefined) values[key] = v.initial;
      }
  const samples: Record<string, number | boolean> = {},
    quality: Record<string, "good"> = {};
  for (const c of catalogFor(sources)) {
    const key = qualifiedKey(c.sourceId, c.symbolPath);
    samples[key] =
      sources.find((s) => s.id === c.sourceId)?.provider === "mock"
        ? values[c.symbolPath]
        : values[key];
    values[key] = samples[key];
    quality[key] = "good";
  }
  return {
    ...next,
    values,
    frames: [
      ...(state.frames ?? []).slice(-599),
      {
        sequence: next.tick,
        sessionTimeMs: timeMs,
        commandRevision: next.revision,
        values: samples,
        quality,
      },
    ],
  };
}
export function readBinding(
  workspace: Workspace,
  state: Sim,
  widget: Widget,
): number | boolean {
  const b = widget.binding;
  const c =
    b &&
    catalogFor(workspace.sources).find(
      (c) => c.sourceId === b.sourceId && c.symbolPath === b.symbolPath,
    );
  if (!b || !c || !compatibleSymbol(widget.kind, c)) return NaN;
  const key = qualifiedKey(c.sourceId, c.symbolPath);
  if (c.type === "boolean" && (b.gain !== 1 || b.offset !== 0)) return NaN;
  const raw = state.values[key];
  const frame = state.frames?.at(-1);
  if (frame && frame.quality[key] !== "good") return NaN;
  // Requested refresh intervals are quantized to worker cadence, holding a prior sample.
  const period = effectiveRefreshMs(b.periodMs),
    target = frame ? Math.floor(frame.sessionTimeMs / period) * period : 0;
  const sample =
    state.running && frame
      ? [...(state.frames ?? [])]
          .reverse()
          .find((f) => f.sessionTimeMs <= target)
      : undefined;
  const value = sample
    ? sample.quality[key] === "good"
      ? sample.values[key]
      : NaN
    : state.running && frame
      ? NaN
      : raw;
  return typeof value === "number"
    ? Number.isFinite(value * b.gain + b.offset)
      ? value * b.gain + b.offset
      : NaN
    : typeof value === "boolean"
      ? value
      : NaN;
}
export function writeRuntime(
  state: Sim,
  sources: Source[],
  sourceId: string,
  symbolPath: string,
  value: unknown,
  epoch: number,
  catalogRevision: number,
): Sim {
  const c = catalogFor(sources).find(
    (c) => c.sourceId === sourceId && c.symbolPath === symbolPath,
  );
  if (
    !state.running ||
    epoch !== state.epoch ||
    catalogRevision !== state.catalogRevision ||
    !c?.writable
  )
    throw new Error(
      "Write denied: stopped, stale session/catalog or read-only variable",
    );
  if (
    c.type === "boolean"
      ? typeof value !== "boolean"
      : typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < c.min ||
        value > c.max
  )
    throw new Error("Write denied: invalid type or range");
  const values = {
    ...state.values,
    [qualifiedKey(sourceId, symbolPath)]: value as number | boolean,
  };
  if (sources.find((s) => s.id === sourceId)?.provider === "mock")
    values[symbolPath] = value as number | boolean;
  return { ...state, revision: state.revision + 1, values };
}
export function rawWidgetWrite(
  workspace: Workspace,
  state: Sim,
  w: Widget,
  value: unknown,
  epoch: number,
) {
  const b = w.binding,
    c =
      b &&
      catalogFor(workspace.sources).find(
        (c) => c.sourceId === b.sourceId && c.symbolPath === b.symbolPath,
      );
  if (
    !b?.writable ||
    !c ||
    !compatibleSymbol(w.kind, c) ||
    !b.gain ||
    !["slider", "switch", "button"].includes(w.kind) ||
    (c.type === "boolean" && (b.gain !== 1 || b.offset !== 0))
  )
    throw new Error("Invalid writable instrument binding");
  if (
    typeof value !== "boolean" &&
    (typeof value !== "number" || !Number.isFinite(value))
  )
    throw new Error("Invalid engineering value");
  const raw = typeof value === "boolean" ? value : (value - b.offset) / b.gain;
  writeRuntime(
    state,
    workspace.sources,
    b.sourceId,
    b.symbolPath,
    raw,
    epoch,
    state.catalogRevision ?? 1,
  );
  return { sourceId: b.sourceId, symbolPath: b.symbolPath, value: raw };
}
export type Sample = {
  sourceId: string;
  symbolPath: string;
  type: "number" | "boolean";
  value: number | boolean | null;
  quality:
    | "good"
    | "stale"
    | "unresolved"
    | "unsupported"
    | "transport-error"
    | "decode-error";
  reason?: string;
};
type Base = { protocolVersion: 1; epoch: number; catalogRevision: number };
export type ProviderMessage = Base &
  (
    | {
        kind: "configure";
        commandRevision: number;
        running: boolean;
        sources: Source[];
      }
    | { kind: "catalog"; symbols: CatalogSymbol[] }
    | {
        kind: "sampleBatch";
        commandRevision: number;
        sequence: number;
        timeMs: number;
        samples: Sample[];
      }
    | {
        kind: "write";
        operationId: string;
        commandRevision: number;
        sourceId: string;
        symbolPath: string;
        value: number | boolean;
      }
    | {
        kind: "writeResult";
        operationId: string;
        commandRevision: number;
        status: "acknowledged" | "rejected" | "unknown";
        reason: string;
        sourceId: string;
        symbolPath: string;
        value: number | boolean | null;
      }
  );
export function validateMessage(input: unknown): ProviderMessage {
  const m = input as ProviderMessage;
  const object = (v: unknown) =>
    !!v && typeof v === "object" && !Array.isArray(v);
  const text = (v: unknown, max = 512) =>
    typeof v === "string" && v.length > 0 && v.length <= max;
  const finite = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  const integer = (v: unknown) =>
    finite(v) && Number.isSafeInteger(v) && Number(v) >= 0;
  const keys = (v: object, allowed: string[]) =>
    Object.keys(v).every((k) => allowed.includes(k));
  const base = ["protocolVersion", "kind", "epoch", "catalogRevision"];
  if (
    !object(m) ||
    m.protocolVersion !== 1 ||
    !integer(m.epoch) ||
    m.epoch < 1 ||
    !integer(m.catalogRevision) ||
    m.catalogRevision < 1
  )
    throw new Error("Invalid provider envelope");
  if (m.kind === "configure") {
    if (
      !keys(m, [...base, "commandRevision", "running", "sources"]) ||
      !integer(m.commandRevision) ||
      typeof m.running !== "boolean" ||
      !Array.isArray(m.sources)
    )
      throw new Error("Invalid configure");
    parseWorkspace({
      schemaVersion: 1,
      id: "provider-config",
      name: "Provider config",
      sources: m.sources,
      screens: [
        {
          id: "screen",
          name: "Config",
          kind: "dashboard",
          canvas: { width: 100, height: 100, grid: 10 },
          widgets: [],
        },
      ],
    });
  } else if (m.kind === "catalog") {
    if (
      !keys(m, [...base, "symbols"]) ||
      !Array.isArray(m.symbols) ||
      m.symbols.length > 128
    )
      throw new Error("Invalid catalog");
    const seen = new Set<string>();
    for (const c of m.symbols) {
      if (
        !object(c) ||
        !keys(c, [
          "sourceId",
          "symbolPath",
          "type",
          "units",
          "min",
          "max",
          "writable",
        ]) ||
        !text(c.sourceId) ||
        !text(c.symbolPath) ||
        !["number", "boolean"].includes(c.type) ||
        typeof c.units !== "string" ||
        c.units.length > 40 ||
        !finite(c.min) ||
        !finite(c.max) ||
        c.max <= c.min ||
        typeof c.writable !== "boolean"
      )
        throw new Error("Invalid catalog entry");
      const key = qualifiedKey(c.sourceId, c.symbolPath);
      if (seen.has(key)) throw new Error("Duplicate catalog entry");
      seen.add(key);
    }
  } else if (m.kind === "sampleBatch") {
    if (
      !keys(m, [...base, "commandRevision", "sequence", "timeMs", "samples"]) ||
      !integer(m.commandRevision) ||
      !integer(m.sequence) ||
      !integer(m.timeMs) ||
      !Array.isArray(m.samples) ||
      m.samples.length > 128
    )
      throw new Error("Invalid sample batch");
    const seen = new Set<string>();
    for (const v of m.samples) {
      if (
        !object(v) ||
        !keys(v, [
          "sourceId",
          "symbolPath",
          "type",
          "value",
          "quality",
          "reason",
        ]) ||
        !text(v.sourceId) ||
        !text(v.symbolPath) ||
        !["number", "boolean"].includes(v.type) ||
        ![
          "good",
          "stale",
          "unresolved",
          "unsupported",
          "transport-error",
          "decode-error",
        ].includes(v.quality) ||
        (v.reason !== undefined &&
          (typeof v.reason !== "string" || v.reason.length > 512)) ||
        (v.quality === "good"
          ? v.type === "number"
            ? !finite(v.value)
            : typeof v.value !== "boolean"
          : v.value !== null)
      )
        throw new Error("Invalid typed sample");
      const key = qualifiedKey(v.sourceId, v.symbolPath);
      if (seen.has(key)) throw new Error("Duplicate sample");
      seen.add(key);
    }
  } else if (m.kind === "write" || m.kind === "writeResult") {
    if (
      !keys(m, [
        ...base,
        "operationId",
        "commandRevision",
        "sourceId",
        "symbolPath",
        "value",
        ...(m.kind === "writeResult" ? ["status", "reason"] : []),
      ]) ||
      !text(m.operationId, 128) ||
      !text(m.sourceId) ||
      !text(m.symbolPath) ||
      !integer(m.commandRevision)
    )
      throw new Error("Invalid write envelope");
    if (
      m.kind === "write"
        ? !(finite(m.value) || typeof m.value === "boolean")
        : !["acknowledged", "rejected", "unknown"].includes(m.status) ||
          typeof m.reason !== "string" ||
          m.reason.length > 512 ||
          !(m.value === null || finite(m.value) || typeof m.value === "boolean")
    )
      throw new Error("Invalid write value/result");
  } else throw new Error("Unknown provider message kind");
  return m;
}
export function applyBatch(state: Sim, input: unknown, sources: Source[]): Sim {
  const m = validateMessage(input);
  if (m.kind !== "sampleBatch") throw new Error("Expected sampleBatch");
  if (
    !state.running ||
    m.epoch !== state.epoch ||
    m.catalogRevision !== state.catalogRevision ||
    m.commandRevision !== state.revision ||
    m.sequence <= state.tick ||
    m.timeMs <= (state.frames?.at(-1)?.sessionTimeMs ?? -1)
  )
    return state;
  const catalog = catalogFor(sources),
    values = { ...state.values },
    acquired: Record<string, number | boolean> = {},
    reasons: Record<string, string> = {},
    quality: NonNullable<Sim["frames"]>[number]["quality"] = {};
  if (m.samples.length !== catalog.length)
    throw new Error("Incomplete provider batch");
  for (const sample of m.samples) {
    const symbol = catalog.find(
      (c) =>
        c.sourceId === sample.sourceId && c.symbolPath === sample.symbolPath,
    );
    if (!symbol || symbol.type !== sample.type)
      throw new Error("Sample does not match catalog");
    if (
      sample.quality === "good" &&
      typeof sample.value === "number" &&
      (sample.value < symbol.min || sample.value > symbol.max)
    )
      throw new Error("Sample outside catalog range");
    const key = qualifiedKey(sample.sourceId, sample.symbolPath);
    quality[key] = sample.quality;
    if (sample.reason !== undefined) reasons[key] = sample.reason;
    if (sample.quality === "good") {
      acquired[key] = sample.value!;
      values[key] = sample.value!;
      if (sources.find((s) => s.id === sample.sourceId)?.provider === "mock")
        values[sample.symbolPath] = sample.value!;
    }
  }
  const speed = acquired[qualifiedKey("mock-motor", "motor.speed")];
  return {
    ...state,
    tick: m.sequence,
    values,
    frames: [
      ...(state.frames ?? []).slice(-599),
      {
        sequence: m.sequence,
        epoch: m.epoch,
        catalogRevision: m.catalogRevision,
        sessionTimeMs: m.timeMs,
        commandRevision: m.commandRevision,
        hostReceivedAtUtc: new Date().toISOString(),
        reasons,
        values: acquired,
        quality,
      },
    ],
    history:
      typeof speed === "number"
        ? [...state.history.slice(-119), speed]
        : state.history,
  };
}
export function messageBase(state: Sim) {
  return {
    protocolVersion: 1 as const,
    epoch: state.epoch,
    catalogRevision: state.catalogRevision ?? 1,
  };
}
