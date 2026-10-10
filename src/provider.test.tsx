import { describe, it, expect } from "vitest";
import {
  createBlankWorkspace,
  createInstrument,
  parseWorkspace,
  initialWorkspace,
  parseSim,
  beginDocument,
  type Source,
  type Binding,
  type RuntimeFrame,
} from "./model";
import { OfflineEngine } from "./engine";
import {
  catalogFor,
  newRuntime,
  stepRuntime,
  qualifiedKey,
  writeRuntime,
  rawWidgetWrite,
  readBinding,
  effectiveRefreshMs,
  validateMessage,
  applyBatch,
  messageBase,
  type ProviderMessage,
} from "./provider";
import { graphPoints, Graph } from "./Graph";
import { renderToStaticMarkup } from "react-dom/server";
const sources: Source[] = [
  {
    id: "lab",
    provider: "offline",
    path: "inline",
    variables: [
      {
        id: "wave",
        type: "number",
        units: "V",
        initial: 5,
        min: 0,
        max: 10,
        writable: false,
        waveform: "sine",
        periodMs: 1000,
      },
      {
        id: "manual",
        type: "number",
        units: "V",
        initial: 2,
        min: 0,
        max: 10,
        writable: true,
        waveform: "constant",
        periodMs: 1000,
      },
      {
        id: "enabled",
        type: "boolean",
        units: "",
        initial: false,
        min: 0,
        max: 1,
        writable: true,
        waveform: "constant",
        periodMs: 1000,
      },
    ],
  },
];
const binding = (symbolPath = "wave"): Binding => ({
  sourceId: "lab",
  symbolPath,
  gain: 1,
  offset: 0,
  units: "V",
  periodMs: 50,
  writable: false,
});
const workspace = () => ({
  ...createBlankWorkspace("Lab", "lab-project"),
  sources: structuredClone(sources),
});
const configure = (epoch = 2, catalogRevision = 1): ProviderMessage => ({
  protocolVersion: 1,
  kind: "configure",
  epoch,
  catalogRevision,
  commandRevision: 0,
  running: true,
  sources,
});
describe("offline provider contract", () => {
  it("reopening the same catalog restores configured initial values instead of missing readings", () => {
    const w = workspace(),
      previous = writeRuntime(
        newRuntime(sources, 4, 2, true),
        sources,
        "lab",
        "manual",
        8,
        4,
        2,
      );
    const reopened = beginDocument(w, previous, "lab.olw.json");
    expect(reopened.sim.running).toBe(false);
    expect(reopened.sim.frames).toEqual([]);
    expect(reopened.sim.values[qualifiedKey("lab", "manual")]).toBe(2);
    const widget = createInstrument("numeric", "display");
    widget.binding = binding("manual");
    expect(readBinding(w, reopened.sim, widget)).toBe(2);
    expect(reopened.sim.epoch).toBe(5);
    expect(reopened.sim.catalogRevision).toBe(3);
  });
  it("roundtrips configured numeric/bool sources and graph bindings while preserving legacy demo", () => {
    const w = workspace(),
      g = createInstrument("graph", "plot");
    g.binding = binding();
    g.settings.graph = {
      mode: "xy",
      x: binding("manual"),
      capacity: 50,
      windowMs: 5000,
    };
    w.screens[0].widgets = [g];
    expect(parseWorkspace(JSON.parse(JSON.stringify(w)))).toEqual(w);
    expect(initialWorkspace().sources[0].provider).toBe("mock");
  });
  it.each([
    "duplicate",
    "badtype",
    "badwave",
    "writablewave",
    "period",
    "range",
    "huge",
    "dangling",
    "boolmap",
    "catalogrights",
    "limit",
  ])("rejects invalid persisted %s configuration", (caseName) => {
    const w = workspace(),
      g = createInstrument("radial", "g");
    g.binding = binding();
    w.screens[0].widgets = [g];
    const vars = w.sources[0].variables!;
    if (caseName === "duplicate") vars.push({ ...vars[0] });
    if (caseName === "badtype") vars[0].initial = true;
    if (caseName === "badwave") vars[0].waveform = "toggle";
    if (caseName === "writablewave") vars[0].writable = true;
    if (caseName === "period") vars[0].periodMs = 0;
    if (caseName === "range") vars[0].initial = 20;
    if (caseName === "huge") vars[0].max = 1e308;
    if (caseName === "dangling") g.binding.symbolPath = "missing";
    if (caseName === "boolmap") {
      g.kind = "led";
      g.binding = { ...binding("enabled"), gain: 2 };
    }
    if (caseName === "catalogrights") g.binding.writable = true;
    if (caseName === "limit")
      vars.push(
        ...Array.from({ length: 128 }, (_, i) => ({
          ...vars[0],
          id: "extra" + i,
        })),
      );
    expect(() => parseWorkspace(w)).toThrow();
  });
  it("validates supported legacy catalog binding types and permissions too", () => {
    for (const patch of [
      { symbolPath: "missing" },
      { symbolPath: "motor.enabled" },
      { writable: true },
    ]) {
      const w = initialWorkspace();
      Object.assign(w.screens[0].widgets[0].binding!, patch);
      expect(() => parseWorkspace(w)).toThrow();
    }
  });
  it("keeps collision-proof source namespaces including offline source named mock-motor", () => {
    const custom = [
      {
        ...sources[0],
        id: "a:b",
        variables: [{ ...sources[0].variables![1], id: "c", initial: 1 }],
      },
      {
        ...sources[0],
        id: "a",
        variables: [{ ...sources[0].variables![1], id: "b:c", initial: 7 }],
      },
      {
        ...sources[0],
        id: "mock-motor",
        variables: [{ ...sources[0].variables![1], id: "manual", initial: 4 }],
      },
    ];
    let state = newRuntime(custom, 2, 1, true);
    state = stepRuntime(state, custom);
    expect(state.values[qualifiedKey("a:b", "c")]).toBe(1);
    expect(state.values[qualifiedKey("a", "b:c")]).toBe(7);
    const w = createInstrument("numeric", "n");
    w.binding = { ...binding("manual"), sourceId: "mock-motor" };
    expect(readBinding({ ...workspace(), sources: custom }, state, w)).toBe(4);
    state = writeRuntime(state, custom, "mock-motor", "manual", 6, 2, 1);
    expect(state.values[qualifiedKey("mock-motor", "manual")]).toBe(6);
  });
  it("bounds sine/ramp/toggle generation and history without changing configured initial values", () => {
    const custom = structuredClone(sources);
    custom[0].variables!.push(
      { ...custom[0].variables![0], id: "ramp", waveform: "ramp" },
      {
        ...custom[0].variables![2],
        id: "toggle",
        waveform: "toggle",
        writable: false,
      },
    );
    let state = newRuntime(custom, 2, 1, true);
    for (let i = 0; i < 750; i++) {
      state = stepRuntime(state, custom);
      for (const id of ["wave", "ramp"]) {
        expect(
          Number(state.values[qualifiedKey("lab", id)]),
        ).toBeGreaterThanOrEqual(0);
        expect(
          Number(state.values[qualifiedKey("lab", id)]),
        ).toBeLessThanOrEqual(10);
      }
    }
    expect(state.frames).toHaveLength(600);
    expect(parseSim(state)).toEqual(state);
    expect(custom[0].variables![1].initial).toBe(2);
    expect(typeof state.values[qualifiedKey("lab", "toggle")]).toBe("boolean");
  });
  it("enforces Run/epoch/catalog/type/range/access and inverse engineering writes", () => {
    const w = workspace(),
      widget = createInstrument("slider", "control");
    widget.binding = {
      ...binding("manual"),
      gain: 2,
      offset: 1,
      writable: true,
    };
    const state = newRuntime(sources, 2, 1, true);
    expect(rawWidgetWrite(w, state, widget, 9, 2).value).toBe(4);
    expect(() => rawWidgetWrite(w, state, widget, 99, 2)).toThrow();
    expect(() =>
      rawWidgetWrite(
        w,
        state,
        { ...widget, binding: { ...widget.binding!, gain: 0 } },
        9,
        2,
      ),
    ).toThrow();
    for (const args of [
      ["wave", 4, 2, 1],
      ["manual", true, 2, 1],
      ["manual", 11, 2, 1],
      ["manual", 3, 1, 1],
      ["manual", 3, 2, 0],
    ] as const)
      expect(() =>
        writeRuntime(state, sources, "lab", args[0], args[1], args[2], args[3]),
      ).toThrow();
    expect(() =>
      writeRuntime(
        { ...state, running: false },
        sources,
        "lab",
        "manual",
        3,
        2,
        1,
      ),
    ).toThrow();
    expect(() =>
      writeRuntime(state, sources, "lab", "enabled", 1, 2, 1),
    ).toThrow();
  });
  it("honors refresh clamped to 50ms ticks rather than ignoring nonmultiple intervals", () => {
    expect([1, 60, 75, 125].map(effectiveRefreshMs)).toEqual([
      50, 100, 100, 150,
    ]);
    let state = newRuntime(sources, 2, 1, true);
    const w = createInstrument("numeric", "n");
    w.binding = { ...binding(), periodMs: 125 };
    for (let i = 0; i < 3; i++) state = stepRuntime(state, sources);
    const first = readBinding(workspace(), state, w);
    state = stepRuntime(state, sources);
    expect(readBinding(workspace(), state, w)).toBe(first);
    state = stepRuntime(state, sources);
    expect(readBinding(workspace(), state, w)).toBe(first);
    state = stepRuntime(state, sources);
    expect(readBinding(workspace(), state, w)).not.toBe(first);
  });
  it("validates envelopes/configuration/catalog/samples and rejects malformed or excessive input", () => {
    const engine = new OfflineEngine();
    const catalog = engine.receive(configure())[0];
    const batch = engine.tick()!;
    expect(validateMessage(catalog)).toEqual(catalog);
    expect(validateMessage(batch)).toEqual(batch);
    const bad = [
      { ...configure(), protocolVersion: 2 },
      {
        ...configure(),
        sources: [
          { id: "x", provider: "offline", path: "inline", variables: [] },
        ],
      },
      { ...configure(), sources: Array(9).fill(sources[0]) },
      { ...catalog, symbols: [catalogFor(sources)[0], catalogFor(sources)[0]] },
      { ...batch, timeMs: 0.5 },
      {
        ...batch,
        samples: [
          {
            sourceId: 1,
            symbolPath: "x",
            type: "number",
            value: 1,
            quality: "good",
          },
        ],
      },
      { ...batch, extra: 1 },
      { ...batch, samples: Array(129).fill({}) },
      {
        ...messageBase(engine.state),
        kind: "write",
        operationId: {},
        commandRevision: 0,
        sourceId: "lab",
        symbolPath: "manual",
        value: 2,
      },
    ];
    for (const m of bad) expect(() => validateMessage(m)).toThrow();
  });
  it("worker owns acknowledged/rejected writes and denies replay/stale configure identities", () => {
    const engine = new OfflineEngine();
    engine.receive(configure());
    const batch = engine.tick()!;
    let main = applyBatch(newRuntime(sources, 2, 1, true), batch, sources);
    const write = {
      ...messageBase(main),
      kind: "write" as const,
      commandRevision: 0,
      operationId: "op1",
      sourceId: "lab",
      symbolPath: "manual",
      value: 5,
    };
    const result = engine.receive(write)[0];
    expect(result.kind === "writeResult" && result.status).toBe("acknowledged");
    main = writeRuntime(main, sources, "lab", "manual", 5, 2, 1);
    expect(applyBatch(main, batch, sources)).toBe(main);
    expect(engine.receive({ ...write, commandRevision: 1 })[0]).toMatchObject({
      kind: "writeResult",
      status: "rejected",
    });
    expect(() =>
      engine.receive({ ...configure(), catalogRevision: 0 }),
    ).toThrow();
    expect(engine.receive({ ...configure(), epoch: 1 })).toEqual([]);
    expect(() =>
      engine.receive({
        ...configure(),
        commandRevision: 1,
        sources: [{ ...sources[0], id: "changed" }],
      }),
    ).toThrow();
    expect(
      engine.receive({
        ...write,
        operationId: "readonly",
        commandRevision: 1,
        symbolPath: "wave",
      })[0],
    ).toMatchObject({ status: "rejected" });
  });
  it("rejects stale/reversed batches, type mismatch and bad quality without fabricating values", () => {
    const engine = new OfflineEngine();
    engine.receive(configure());
    let main = newRuntime(sources, 2, 1, true);
    const first = engine.tick()!;
    main = applyBatch(main, first, sources);
    for (const patch of [
      { epoch: 1 },
      { catalogRevision: 2 },
      { commandRevision: 1 },
      { sequence: 0 },
      { timeMs: 0 },
    ])
      expect(applyBatch(main, { ...first, ...patch }, sources)).toBe(main);
    const next = engine.tick()!;
    if (next.kind !== "sampleBatch") throw Error();
    expect(() =>
      applyBatch(
        main,
        {
          ...next,
          samples: next.samples.map((s, i) =>
            i ? s : { ...s, type: "boolean", value: true },
          ),
        },
        sources,
      ),
    ).toThrow();
    const bad = {
      ...next,
      samples: next.samples.map((s, i) =>
        i ? s : { ...s, value: null, quality: "unresolved" },
      ),
    };
    main = applyBatch(main, bad, sources);
    const widget = createInstrument("radial", "g");
    widget.binding = binding();
    expect(Number.isNaN(readBinding(workspace(), main, widget))).toBe(true);
    expect(
      Number.isNaN(
        readBinding(workspace(), { ...main, running: false }, widget),
      ),
    ).toBe(true);
    const prior = JSON.stringify(main),
      third = engine.tick()!;
    if (third.kind !== "sampleBatch") throw Error();
    expect(() =>
      applyBatch(
        main,
        {
          ...third,
          samples: third.samples.map((s, i) =>
            i === 2 ? { ...s, type: "number", value: 999 } : s,
          ),
        },
        sources,
      ),
    ).toThrow();
    expect(JSON.stringify(main)).toBe(prior);
  });
});
describe("coherent 2D graph", () => {
  const frame = (
    sequence: number,
    y: number,
    x: number,
    quality: "good" | "stale" = "good",
  ): RuntimeFrame => ({
    sequence,
    sessionTimeMs: sequence * 50,
    values: {
      [qualifiedKey("lab", "wave")]: y,
      [qualifiedKey("lab", "manual")]: x,
    },
    quality: {
      [qualifiedKey("lab", "wave")]: quality,
      [qualifiedKey("lab", "manual")]: "good",
    },
  });
  it("maps time and transformed XY samples from the same frame and never bridges bad quality or missing sequences", () => {
    const w = createInstrument("graph", "g");
    w.binding = { ...binding(), gain: 2, offset: 1 };
    w.settings.graph = {
      mode: "xy",
      x: { ...binding("manual"), gain: 3, offset: -1 },
      capacity: 100,
      windowMs: 5000,
    };
    expect(
      graphPoints(
        w,
        [frame(1, 2, 4), frame(2, 3, 8, "stale"), frame(3, 4, 5)],
        workspace(),
      ),
    ).toEqual([{ x: 11, y: 5 }, null, { x: 14, y: 9 }]);
    expect(
      graphPoints(w, [frame(1, 2, 4), frame(3, 4, 5)], workspace()),
    ).toContain(null);
    w.settings.graph.mode = "time";
    expect(graphPoints(w, [frame(1, 2, 4)], workspace())).toEqual([
      { x: 0.05, y: 5 },
    ]);
    w.settings.graph.mode = "xy";
    w.settings.graph.x!.symbolPath = "enabled";
    expect(graphPoints(w, [frame(1, 2, 4)], workspace())).toEqual([]);
  });
  it("keeps gaps even inside decimation buckets and respects capacity/window/session bounds", () => {
    const w = createInstrument("graph", "g");
    w.binding = { ...binding(), periodMs: 150 };
    w.settings.graph = { mode: "time", capacity: 10, windowMs: 1000 };
    const frames = [
      frame(3, 1, 1),
      frame(4, 1, 1, "stale"),
      frame(5, 2, 1),
      frame(6, 3, 1),
    ];
    expect(graphPoints(w, frames, workspace())).toEqual([
      { x: 0.15, y: 1 },
      null,
      { x: 0.3, y: 3 },
    ]);
    const many = Array.from({ length: 1000 }, (_, i) =>
      frame(i + 1, i % 10, 1),
    );
    expect(graphPoints(w, many, workspace()).length).toBeLessThanOrEqual(10);
    expect(graphPoints(w, [], workspace())).toEqual([]);
  });
  it("rejects nonfinite transformed points and renders axes/no acquired data without layout preview samples", () => {
    const w = createInstrument("graph", "g");
    w.binding = { ...binding(), gain: 1e308 };
    expect(graphPoints(w, [frame(1, 10, 1)], workspace())).toEqual([null]);
    const markup = renderToStaticMarkup(
      <Graph
        w={w}
        sim={newRuntime(sources, 2, 1, false)}
        workspace={workspace()}
      />,
    );
    expect(markup).toContain("No acquired data");
    expect(markup).toContain("Elapsed simulation time (s)");
    expect(markup).not.toContain("Design preview");
    w.settings.graph!.autoY = false;
    w.settings.min = -5;
    w.settings.max = 15;
    w.settings.precision = 1;
    const manual = renderToStaticMarkup(
      <Graph
        w={w}
        sim={newRuntime(sources, 2, 1, false)}
        workspace={workspace()}
      />,
    );
    expect(manual).toContain(">-5.0</text>");
    expect(manual).toContain(">15.0</text>");
  });
});
