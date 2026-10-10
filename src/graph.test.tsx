import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Graph,
  axisLabel,
  axisTick,
  graphAxes,
  graphPoints,
  normalized,
  safeAxis,
} from "./Graph";
import {
  createBlankWorkspace,
  createInstrument,
  parseSim,
  parseWorkspace,
  type RuntimeFrame,
} from "./model";
import { newRuntime, qualifiedKey } from "./provider";

const workspace = createBlankWorkspace("Graph regression", "graph-project");
workspace.sources = [
  {
    id: "lab",
    provider: "offline",
    path: "inline",
    variables: [
      {
        id: "value",
        type: "number",
        units: "V",
        initial: 25,
        min: 0,
        max: 100,
        writable: true,
        waveform: "constant",
        periodMs: 1000,
      },
    ],
  },
];
const widget = createInstrument("graph", "a)b");
widget.binding = {
  sourceId: "lab",
  symbolPath: "value",
  gain: 1,
  offset: 0,
  units: "V",
  periodMs: 50,
  writable: false,
};
widget.settings.graph = { mode: "time", capacity: 200, windowMs: 10000 };
const key = qualifiedKey("lab", "value");
const frame = (
  sequence: number,
  value: number,
  commandRevision?: number,
): RuntimeFrame => ({
  sequence,
  sessionTimeMs: sequence * 50,
  commandRevision,
  values: { [key]: value },
  quality: { [key]: "good" },
});

describe("graph geometry and capture presentation", () => {
  it("keeps manual signal movement visible on stable transformed catalog axes", () => {
    const low = graphAxes(widget, [{ x: 1, y: 25 }], workspace);
    const high = graphAxes(widget, [{ x: 2, y: 100 }], workspace);
    expect(low.y).toEqual({ min: 0, max: 100 });
    expect(high.y).toEqual(low.y);
    expect(normalized(25, low.y)).toBe(0.25);
    expect(normalized(100, high.y)).toBe(1);
    const reversed = structuredClone(widget);
    reversed.binding!.gain = -2;
    reversed.binding!.offset = 10;
    expect(graphAxes(reversed, [], workspace).y).toEqual({
      min: -190,
      max: 10,
    });
  });
  it("normalizes finite extreme and constant axes without NaN, infinity or duplicate ticks", () => {
    expect(normalized(1e308, { min: -1e308, max: -9e307 })).toBeGreaterThan(1);
    for (const axis of [
      safeAxis(-1e308, 1e308),
      safeAxis(1e308, 1e308),
      safeAxis(25, 25),
    ]) {
      const labels = Array.from({ length: 5 }, (_, i) =>
        axisLabel(axis, i / 4),
      );
      expect(new Set(labels).size).toBe(5);
      for (let i = 0; i <= 4; i++) {
        expect(Number.isFinite(axisTick(axis, i / 4))).toBe(true);
        expect(normalized(axisTick(axis, i / 4), axis)).toBeCloseTo(i / 4);
      }
    }
    const manual = structuredClone(widget);
    manual.settings.graph!.autoY = false;
    manual.settings.min = -1e308;
    manual.settings.max = 1e308;
    expect(graphAxes(manual, [], workspace).y).toEqual({
      min: -1e308,
      max: 1e308,
    });
  });
  it("marks isolated samples and allocates unique clip IDs independently of persisted IDs", () => {
    const sim = newRuntime(workspace.sources, 2, 1, false);
    sim.frames = [frame(1, 25)];
    const markup = renderToStaticMarkup(
      <>
        <Graph w={widget} sim={sim} workspace={workspace} />
        <Graph w={widget} sim={sim} workspace={workspace} thumbnail />
      </>,
    );
    const ids = [...markup.matchAll(/<clipPath id="([^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    expect(markup).not.toContain("url(#a)b)");
    expect(markup).toContain("<circle");
    expect(markup).toContain("STOPPED • frozen capture");
    expect(markup).toContain("Y: 25 V");
    expect(markup).not.toMatch(/(?:NaN|Infinity)/);
  });
  it("breaks control-write trajectories without inventing gaps in legacy captures", () => {
    expect(
      graphPoints(widget, [frame(1, 25, 0), frame(2, 100, 1)], workspace),
    ).toEqual([{ x: 0.05, y: 25 }, null, { x: 0.1, y: 100 }]);
    expect(
      graphPoints(widget, [frame(1, 25), frame(2, 30)], workspace),
    ).not.toContain(null);
    const sim = newRuntime(workspace.sources, 2, 1, false);
    sim.frames = [frame(1, 25, -0.5)];
    expect(() => parseSim(sim)).toThrow();
  });
  it("persists explicit XY scatter/trajectory choices and accepts old absent choices", () => {
    const doc = structuredClone(workspace);
    doc.screens[0].widgets = [structuredClone(widget)];
    for (const traceMode of ["line", "points"] as const) {
      doc.screens[0].widgets[0].settings.graph!.traceMode = traceMode;
      expect(
        parseWorkspace(JSON.parse(JSON.stringify(doc))).screens[0].widgets[0]
          .settings.graph!.traceMode,
      ).toBe(traceMode);
    }
    delete doc.screens[0].widgets[0].settings.graph!.traceMode;
    expect(() => parseWorkspace(doc)).not.toThrow();
  });
});

it("persists bounded named series with independent binding and unions visible catalog scales", () => {
  const w = structuredClone(widget),
    project = structuredClone(workspace);
  w.settings.graph!.primaryName = "Voltage";
  w.settings.graph!.series = [
    {
      id: "scaled",
      name: "Scaled",
      color: "#da8426",
      visible: true,
      binding: { ...w.binding!, gain: 2, units: "kV" },
    },
  ];
  project.screens[0].widgets = [w];
  const loaded = parseWorkspace(JSON.parse(JSON.stringify(project)));
  expect(loaded.screens[0].widgets[0].settings.graph!.series![0].name).toBe(
    "Scaled",
  );
  expect(graphAxes(w, [], project).y).toEqual({ min: 0, max: 200 });
  const sim = newRuntime(project.sources, 1, 1, false);
  sim.frames = [frame(1, 25)];
  const markup = renderToStaticMarkup(
    <Graph w={w} sim={sim} workspace={project} />,
  );
  expect(markup).toContain("Voltage: 25 V");
  expect(markup).toContain("Scaled: 50 kV");
  expect(markup).toContain("Mixed units: V / kV");
  expect(markup).toContain('stroke-dasharray="6 3"');
  w.settings.graph!.series[0].visible = false;
  expect(graphAxes(w, [], project).y).toEqual({ min: 0, max: 100 });
  const bad = structuredClone(project);
  bad.screens[0].widgets[0].settings.graph!.series!.push({
    ...bad.screens[0].widgets[0].settings.graph!.series![0],
  });
  expect(() => parseWorkspace(bad)).toThrow("Duplicate graph series");
  bad.screens[0].widgets[0].settings.graph!.series = [
    {
      id: "unknown",
      name: "Bad",
      color: "#da8426",
      visible: true,
      binding: { ...w.binding!, symbolPath: "missing" },
    },
  ];
  expect(() => parseWorkspace(bad)).toThrow("Unknown supported variable");
});
it("retains a one-frame spike inside a slower refresh interval and does not highlight bad current quality", () => {
  const w = structuredClone(widget);
  w.binding!.periodMs = 500;
  w.settings.graph!.capacity = 10;
  const frames = Array.from({ length: 40 }, (_, i) =>
    frame(i + 1, i === 11 ? 100 : 0),
  );
  expect(graphPoints(w, frames, workspace).some((p) => p?.y === 100)).toBe(
    true,
  );
  const bad = frame(41, 0);
  bad.quality[key] = "unresolved";
  const points = graphPoints(w, [...frames, bad], workspace);
  expect(points.at(-1)).toBeNull();
});

it("XY graph pipeline preserves isolated X spikes at constant Y through bounded decimation", () => {
  const doc = structuredClone(workspace);
  doc.sources[0].variables!.push({ ...doc.sources[0].variables![0], id: "x" });
  const w = structuredClone(widget);
  w.settings.graph = {
    mode: "xy",
    capacity: 10,
    windowMs: 30000,
    x: { ...w.binding!, symbolPath: "x" },
  };
  const xKey = qualifiedKey("lab", "x");
  const frames = Array.from({ length: 300 }, (_, i) => ({
    ...frame(i + 1, 25),
    values: { [key]: 25, [xKey]: i === 151 ? 95 : 5 },
    quality: { [key]: "good" as const, [xKey]: "good" as const },
  }));
  const points = graphPoints(w, frames, doc);
  expect(points.length).toBeLessThanOrEqual(10);
  expect(points).toContainEqual({ x: 95, y: 25 });
});
