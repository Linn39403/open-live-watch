import validate from "./workspace-validator.js";
import demo from "../examples/demo.olw.json";
export type Kind =
  | "numeric"
  | "radial"
  | "linear"
  | "thermometer"
  | "led"
  | "slider"
  | "switch"
  | "button"
  | "graph";
export type OfflineVariable = {
  id: string;
  type: "number" | "boolean";
  units: string;
  initial: number | boolean;
  min: number;
  max: number;
  writable: boolean;
  waveform: "constant" | "sine" | "ramp" | "toggle";
  periodMs: number;
};
export type Source = {
  id: string;
  provider: string;
  path: string;
  variables?: OfflineVariable[];
};
export type Binding = {
  sourceId: string;
  symbolPath: string;
  gain: number;
  offset: number;
  units: string;
  periodMs: number;
  writable: boolean;
};
export type GraphConfig = {
  mode: "time" | "xy";
  x?: Binding;
  capacity: number;
  windowMs: number;
  autoY?: boolean;
};
export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
};
export type Widget = {
  id: string;
  kind: Kind;
  title: string;
  rect: Rect;
  binding?: {
    sourceId: string;
    symbolPath: string;
    gain: number;
    offset: number;
    units: string;
    periodMs: number;
    writable: boolean;
  };
  settings: {
    color?: string;
    needleColor?: string;
    min?: number;
    max?: number;
    precision?: number;
    commit?: "release" | "apply";
    graph?: GraphConfig;
  };
};
export type Workspace = {
  schemaVersion: 1;
  id: string;
  name: string;
  sources: Source[];
  screens: {
    id: string;
    name: string;
    kind: "dashboard";
    canvas: { width: number; height: number; grid: number };
    widgets: Widget[];
  }[];
};
export function parseWorkspace(input: unknown): Workspace {
  if (!validate(input))
    throw new Error(
      "Invalid workspace: " +
        validate.errors
          ?.map((e) => e.instancePath + " " + e.message)
          .join("; "),
    );
  const w = input as Workspace;
  const ids = new Set<string>();
  let variableCount = 0;
  for (const source of w.sources) {
    if (ids.has(source.id)) throw new Error("Duplicate source");
    ids.add(source.id);
    if (source.provider === "offline") {
      if (!source.variables)
        throw new Error("Offline source requires variables");
      const variables = new Set<string>();
      for (const v of source.variables) {
        variableCount++;
        if (variables.has(v.id)) throw new Error("Duplicate variable");
        variables.add(v.id);
        if (
          v.max <= v.min ||
          (v.type === "number"
            ? typeof v.initial !== "number" ||
              v.initial < v.min ||
              v.initial > v.max ||
              v.waveform === "toggle"
            : typeof v.initial !== "boolean" ||
              !["constant", "toggle"].includes(v.waveform))
        )
          throw new Error("Invalid variable type/range/waveform");
        if (v.waveform !== "constant" && v.writable)
          throw new Error("Waveforms are read-only");
      }
    } else if (source.variables)
      throw new Error("Variables require offline provider");
  }
  if (
    variableCount +
      (w.sources.some((s) => s.id === "mock-motor" && s.provider === "mock")
        ? 4
        : 0) >
    128
  )
    throw new Error("Catalog exceeds 128 variables");
  const screens = new Set<string>(),
    widgets = new Set<string>();
  for (const s of w.screens) {
    if (screens.has(s.id)) throw new Error("Duplicate screen");
    screens.add(s.id);
    for (const v of s.widgets) {
      if (widgets.has(v.id)) throw new Error("Duplicate widget");
      widgets.add(v.id);
      if (v.binding && !ids.has(v.binding.sourceId))
        throw new Error("Unknown binding source");
      if (v.settings.graph?.x && !ids.has(v.settings.graph.x.sourceId))
        throw new Error("Unknown graph X source");
      if (v.settings.graph?.mode === "xy" && !v.settings.graph.x)
        throw new Error("XY graph requires X binding");
      for (const binding of [v.binding, v.settings.graph?.x]) {
        if (!binding) continue;
        const source = w.sources.find((s) => s.id === binding.sourceId);
        if (
          source?.provider === "offline" ||
          (source?.provider === "mock" && source.id === "mock-motor")
        ) {
          const legacy = symbols.find((x) => x.path === binding.symbolPath);
          const variable =
            source.provider === "offline"
              ? source.variables?.find((x) => x.id === binding.symbolPath)
              : legacy
                ? {
                    type: legacy.type === "bool" ? "boolean" : "number",
                    writable: legacy.writable,
                  }
                : undefined;
          if (!variable) throw new Error("Unknown supported variable binding");
          const boolKind = ["led", "switch", "button"].includes(v.kind);
          if (
            (variable.type === "boolean") !== boolKind ||
            (binding === v.settings.graph?.x && variable.type !== "number")
          )
            throw new Error("Incompatible binding type");
          if (
            variable.type === "boolean" &&
            (binding.gain !== 1 || binding.offset !== 0)
          )
            throw new Error("Boolean binding requires identity mapping");
          if (binding.writable && !variable.writable)
            throw new Error("Binding cannot grant write permission");
        }
      }
      if ((v.settings.max ?? 100) <= (v.settings.min ?? 0))
        throw new Error("Invalid range");
    }
  }
  return structuredClone(w);
}
export const initialWorkspace = () => parseWorkspace(demo);
export function createBlankWorkspace(
  name = "Untitled project",
  id: string = crypto.randomUUID(),
): Workspace {
  const cleanName = name.trim();
  if (!cleanName || cleanName.length > 120)
    throw new Error("Project name must contain 1–120 characters");
  return parseWorkspace({
    schemaVersion: 1,
    id,
    name: cleanName,
    sources: [],
    screens: [
      {
        id: "screen-" + id,
        name: "Screen 1",
        kind: "dashboard",
        canvas: { width: 1024, height: 768, grid: 16 },
        widgets: [],
      },
    ],
  });
}
export function createInstrument(kind: Kind, id: string, index = 0): Widget {
  return {
    id,
    kind,
    title:
      kind === "radial"
        ? "Analog gauge"
        : kind === "linear"
          ? "Linear gauge"
          : kind === "numeric"
            ? "Numeric display"
            : kind[0].toUpperCase() + kind.slice(1),
    rect: {
      x: 48 + (index % 4) * 30,
      y: 48 + (index % 4) * 30,
      width: kind === "graph" ? 400 : kind === "thermometer" ? 150 : 220,
      height: kind === "graph" ? 260 : kind === "thermometer" ? 250 : 190,
      rotation: 0,
    },
    settings: {
      min: kind === "thermometer" ? -20 : 0,
      max:
        kind === "thermometer"
          ? 120
          : ["led", "switch", "button"].includes(kind)
            ? 1
            : 100,
      precision: kind === "thermometer" ? 1 : 0,
      ...(kind === "graph"
        ? { graph: { mode: "time" as const, capacity: 200, windowMs: 10000 } }
        : {}),
    },
  };
}
export function hasMotorSimulator(workspace: Workspace) {
  return workspace.sources.some(
    (source) => source.id === "mock-motor" && source.provider === "mock",
  );
}
export function resetProjectSession(
  previous: Sim,
  sources: Source[] = [],
): Sim {
  const values = { ...initialSim().values };
  for (const source of sources) {
    if (source.provider === "offline")
      for (const variable of source.variables ?? [])
        values[JSON.stringify([source.id, variable.id])] = variable.initial;
    else if (source.provider === "mock" && source.id === "mock-motor")
      for (const symbol of symbols)
        values[JSON.stringify([source.id, symbol.path])] = values[symbol.path];
  }
  return {
    ...initialSim(),
    epoch: previous.epoch + 1,
    catalogRevision: (previous.catalogRevision ?? 0) + 1,
    frames: [],
    values,
  };
}
export function isDocumentDirty(workspace: Workspace, saved: string) {
  return JSON.stringify(workspace) !== saved;
}
export function workspaceFileName(name: string) {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "-") + ".olw.json";
}
export function assertProjectEpoch(sim: Sim, epoch: unknown) {
  if (epoch !== sim.epoch)
    throw new Error("Editor command belongs to a previous project session");
}
export function beginDocument(
  workspace: Workspace,
  previous: Sim,
  filePath: string | null = null,
  unsaved = false,
) {
  const validated = parseWorkspace(workspace);
  return {
    history: { past: [], present: validated, future: [] } as History,
    sim: resetProjectSession(previous, validated.sources),
    saved: unsaved ? "" : JSON.stringify(validated),
    filePath,
  };
}
export type History = {
  past: Workspace[];
  present: Workspace;
  future: Workspace[];
};
export function commit(h: History, w: Workspace): History {
  if (JSON.stringify(h.present) === JSON.stringify(w)) return h;
  return { past: [...h.past.slice(-99), h.present], present: w, future: [] };
}
export function undo(h: History): History {
  if (!h.past.length) return h;
  return {
    past: h.past.slice(0, -1),
    present: h.past.at(-1)!,
    future: [h.present, ...h.future],
  };
}
export function redo(h: History): History {
  if (!h.future.length) return h;
  return {
    past: [...h.past, h.present],
    present: h.future[0],
    future: h.future.slice(1),
  };
}
export const symbols = [
  { path: "motor.speed", type: "f32", writable: false, units: "rpm" },
  { path: "motor.setpoint", type: "f32", writable: true, units: "rpm" },
  { path: "motor.temperature", type: "f32", writable: false, units: "°C" },
  { path: "motor.enabled", type: "bool", writable: true, units: "" },
];
export function bindingCompatible(kind: Kind, path: string) {
  const s = symbols.find((s) => s.path === path);
  return (
    !!s && (s.type === "bool") === ["led", "switch", "button"].includes(kind)
  );
}
export function moveDelta(delta: number, grid: number, snap: boolean) {
  return snap ? Math.round(delta / grid) * grid : delta;
}
export function writeWidget(
  sim: Sim,
  w: Widget,
  value: unknown,
  epoch: number,
): Sim {
  if (
    !w.binding?.writable ||
    w.binding.sourceId !== "mock-motor" ||
    !w.binding.gain ||
    !bindingCompatible(w.kind, w.binding.symbolPath)
  )
    throw new Error("Invalid writable binding");
  const raw =
    typeof value === "boolean"
      ? value
      : (Number(value) - w.binding.offset) / w.binding.gain;
  return write(sim, w.binding.symbolPath, raw, epoch);
}
export type Sim = {
  epoch: number;
  revision: number;
  running: boolean;
  tick: number;
  values: Record<string, number | boolean>;
  history: number[];
  catalogRevision?: number;
  frames?: RuntimeFrame[];
};
export type RuntimeFrame = {
  sequence: number;
  sessionTimeMs: number;
  values: Record<string, number | boolean>;
  quality: Record<
    string,
    | "good"
    | "unresolved"
    | "stale"
    | "unsupported"
    | "transport-error"
    | "decode-error"
  >;
};
export const initialSim = (): Sim => ({
  epoch: 1,
  revision: 0,
  running: false,
  tick: 0,
  values: {
    "motor.speed": 0,
    "motor.setpoint": 1600,
    "motor.temperature": 26,
    "motor.enabled": true,
  },
  history: [],
});
export function step(s: Sim): Sim {
  if (!s.running) return s;
  const speed =
    Number(s.values["motor.speed"]) +
    (Number(s.values["motor.enabled"] ? s.values["motor.setpoint"] : 0) -
      Number(s.values["motor.speed"])) *
      0.08;
  return {
    ...s,
    tick: s.tick + 1,
    values: {
      ...s.values,
      "motor.speed": speed,
      "motor.temperature": 26 + speed / 110 + Math.sin(s.tick / 20),
    },
    history: [...s.history.slice(-119), speed],
  };
}
export function write(
  s: Sim,
  path: string,
  value: unknown,
  epoch: number,
): Sim {
  const symbol = symbols.find((x) => x.path === path);
  if (!s.running || s.epoch !== epoch || !symbol?.writable)
    throw new Error(
      "Write rejected: stopped, stale session, or read-only symbol",
    );
  if (
    symbol.type === "bool"
      ? typeof value !== "boolean"
      : typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < 0 ||
        value > 3000
  )
    throw new Error("Invalid simulated value");
  return {
    ...s,
    revision: s.revision + 1,
    values: { ...s.values, [path]: value as number | boolean },
  };
}
export function acceptWorkerFrame(current: Sim, incoming: Sim): Sim {
  return current.running &&
    incoming.epoch === current.epoch &&
    incoming.revision === current.revision &&
    incoming.tick >= current.tick
    ? incoming
    : current;
}
export function parseSim(input: unknown): Sim {
  const s = input as Sim;
  if (
    !s ||
    !Number.isSafeInteger(s.epoch) ||
    !Number.isSafeInteger(s.revision) ||
    !Number.isSafeInteger(s.tick) ||
    s.epoch < 1 ||
    s.revision < 0 ||
    s.tick < 0 ||
    (s.catalogRevision !== undefined &&
      (!Number.isSafeInteger(s.catalogRevision) || s.catalogRevision < 1)) ||
    typeof s.running !== "boolean" ||
    !Array.isArray(s.history) ||
    s.history.length > 120 ||
    s.history.some((v) => typeof v !== "number" || !Number.isFinite(v)) ||
    !s.values
  )
    throw new Error("Invalid simulator frame");
  if (
    typeof s.values !== "object" ||
    Array.isArray(s.values) ||
    Object.keys(s.values).length > 132 ||
    Object.values(s.values).some(
      (v) =>
        !(
          typeof v === "boolean" ||
          (typeof v === "number" && Number.isFinite(v))
        ),
    )
  )
    throw new Error("Invalid runtime values");
  if (s.frames !== undefined) {
    if (!Array.isArray(s.frames) || s.frames.length > 600)
      throw new Error("Invalid frame history");
    let sequence = -1,
      time = -1;
    for (const frame of s.frames) {
      if (
        !frame ||
        !Number.isSafeInteger(frame.sequence) ||
        frame.sequence <= sequence ||
        !Number.isSafeInteger(frame.sessionTimeMs) ||
        frame.sessionTimeMs <= time ||
        !frame.values ||
        !frame.quality ||
        Array.isArray(frame.quality) ||
        Array.isArray(frame.values) ||
        Object.keys(frame.quality).length > 128
      )
        throw new Error("Invalid coherent frame");
      for (const [key, quality] of Object.entries(frame.quality)) {
        if (
          ![
            "good",
            "stale",
            "unresolved",
            "unsupported",
            "transport-error",
            "decode-error",
          ].includes(quality)
        )
          throw new Error("Invalid quality");
        if (
          quality === "good" &&
          !(
            typeof frame.values[key] === "boolean" ||
            (typeof frame.values[key] === "number" &&
              Number.isFinite(frame.values[key]))
          )
        )
          throw new Error("Invalid frame value");
      }
      sequence = frame.sequence;
      time = frame.sessionTimeMs;
    }
  }
  for (const symbol of symbols) {
    const value = s.values[symbol.path];
    if (
      symbol.type === "bool"
        ? typeof value !== "boolean"
        : typeof value !== "number" || !Number.isFinite(value)
    )
      throw new Error("Invalid typed simulator frame");
  }
  return s;
}
