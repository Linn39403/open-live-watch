import { describe, it, expect } from "vitest";
import {
  initialWorkspace,
  parseWorkspace,
  commit,
  undo,
  redo,
  initialSim,
  step,
  write,
  writeWidget,
  moveDelta,
  bindingCompatible,
  acceptWorkerFrame,
  parseSim,
} from "./model";
describe("worker ordering", () => {
  it("rejects a delayed pre-write sample from the same session", () => {
    const current = { ...initialSim(), running: true };
    const delayed = step(current);
    const changed = write(current, "motor.setpoint", 500, current.epoch);
    expect(acceptWorkerFrame(changed, delayed)).toBe(changed);
    expect(
      acceptWorkerFrame(changed, step(changed)).values["motor.setpoint"],
    ).toBe(500);
  });
  it("rejects malformed worker frames and rewound ticks", () => {
    const current = step({ ...initialSim(), running: true });
    expect(acceptWorkerFrame(current, { ...current, tick: 0 })).toBe(current);
    expect(() =>
      parseSim({ ...current, history: Array(121).fill(0) }),
    ).toThrow();
    expect(() =>
      parseSim({
        ...current,
        values: { ...current.values, "motor.enabled": 1 },
      }),
    ).toThrow();
  });
});
describe("designer and engineering writes", () => {
  it("preserves off-grid grab offset with snapped displacement at all zoom levels", () => {
    for (const zoom of [0.5, 1, 2])
      expect(13 + moveDelta((32 * zoom) / zoom, 16, true)).toBe(45);
    expect(13 + moveDelta(1, 16, true)).toBe(13);
    expect(moveDelta(1.5, 16, false)).toBe(1.5);
  });
  it("converts engineering writes and rejects invalid widget binding", () => {
    const w = initialWorkspace().screens[0].widgets[1];
    w.binding!.gain = 2;
    w.binding!.offset = 10;
    const s = { ...initialSim(), running: true };
    expect(writeWidget(s, w, 2010, 1).values["motor.setpoint"]).toBe(1000);
    w.binding!.gain = 0;
    expect(() => writeWidget(s, w, 20, 1)).toThrow();
    expect(bindingCompatible("slider", "motor.enabled")).toBe(false);
    expect(bindingCompatible("led", "motor.speed")).toBe(false);
  });
  it("rejects duplicate identity across screens", () => {
    const w = initialWorkspace();
    w.screens.push({ ...structuredClone(w.screens[0]), id: "other" });
    expect(() => parseWorkspace(w)).toThrow();
  });
});
describe("portable workspace boundary", () => {
  it("roundtrips complete original demo", () => {
    const w = initialWorkspace();
    expect(parseWorkspace(JSON.parse(JSON.stringify(w)))).toEqual(w);
  });
  it("rejects unknown versions, malformed geometry, duplicate IDs and dangling sources", () => {
    for (const mutate of [
      (w: any) => (w.schemaVersion = 2),
      (w: any) => (w.screens[0].widgets[0].rect.width = -1),
      (w: any) => w.screens[0].widgets.push(w.screens[0].widgets[0]),
      (w: any) => (w.screens[0].widgets[0].binding.sourceId = "missing"),
      (w: any) => (w.screens[0].widgets[0].rect.x = Infinity),
    ]) {
      const w = initialWorkspace();
      mutate(w);
      expect(() => parseWorkspace(w)).toThrow();
    }
  });
  it("preserves geometry through undo/redo and clears branch on new edits", () => {
    const w = initialWorkspace(),
      changed = structuredClone(w);
    changed.screens[0].widgets[0].rect = {
      x: 123,
      y: 87,
      width: 345,
      height: 222,
      rotation: 37,
    };
    let h = commit({ past: [], present: w, future: [] }, changed);
    expect(undo(h).present).toEqual(w);
    expect(redo(undo(h)).present).toEqual(changed);
    h = commit(undo(h), { ...w, name: "branch" });
    expect(h.future).toHaveLength(0);
  });
});
describe("simulated session boundary", () => {
  it("rejects stopped, stale, read-only, wrong typed and out of range writes", () => {
    const s = { ...initialSim(), running: true };
    expect(() => write(initialSim(), "motor.setpoint", 20, 1)).toThrow();
    for (const [path, value, epoch] of [
      ["motor.setpoint", 20, 0],
      ["motor.speed", 20, 1],
      ["motor.enabled", 1, 1],
      ["motor.setpoint", 4000, 1],
      ["motor.setpoint", NaN, 1],
    ] as const)
      expect(() => write(s, path, value, epoch)).toThrow();
    expect(write(s, "motor.enabled", false, 1).values["motor.enabled"]).toBe(
      false,
    );
  });
  it("stops deterministically and bounds chart samples", () => {
    let s = { ...initialSim(), running: true };
    for (let i = 0; i < 1000; i++) s = step(s);
    expect(s.history).toHaveLength(120);
    expect(Number(s.values["motor.speed"])).toBeCloseTo(1600);
    s = { ...s, running: false };
    expect(step(s)).toBe(s);
  });
});
