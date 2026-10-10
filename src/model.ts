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
  | "button";
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
  };
};
export type Workspace = {
  schemaVersion: 1;
  id: string;
  name: string;
  sources: { id: string; provider: string; path: string }[];
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
  for (const source of w.sources) {
    if (ids.has(source.id)) throw new Error("Duplicate source");
    ids.add(source.id);
  }
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
      if ((v.settings.max ?? 100) <= (v.settings.min ?? 0))
        throw new Error("Invalid range");
    }
  }
  return structuredClone(w);
}
export const initialWorkspace = () => parseWorkspace(demo);
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
    typeof s.running !== "boolean" ||
    !Array.isArray(s.history) ||
    s.history.length > 120 ||
    s.history.some((v) => typeof v !== "number" || !Number.isFinite(v)) ||
    !s.values
  )
    throw new Error("Invalid simulator frame");
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
