import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Instrument } from "./Instruments";
import {
  createBlankWorkspace,
  workspaceFileName,
  createInstrument,
  hasMotorSimulator,
  initialWorkspace,
  initialSim,
  parseWorkspace,
  beginDocument,
  isDocumentDirty,
  commit,
  undo,
  assertProjectEpoch,
  acceptWorkerFrame,
  type Kind,
} from "./model";
describe("new project workflow", () => {
  it("preserves ordinary project names and sanitizes forbidden filename characters", () => {
    expect(workspaceFileName("Project x10")).toBe("Project x10.olw.json");
    expect(workspaceFileName("Pump Ω / test\u0001")).toBe(
      "Pump Ω - test-.olw.json",
    );
  });
  it("creates a named blank portable project with no implied motor source", () => {
    const blank = createBlankWorkspace("  Pump panel Ω  ", "new-project");
    expect(blank.name).toBe("Pump panel Ω");
    expect(blank.sources).toEqual([]);
    expect(blank.screens[0].widgets).toEqual([]);
    expect(hasMotorSimulator(blank)).toBe(false);
    expect(parseWorkspace(JSON.parse(JSON.stringify(blank)))).toEqual(blank);
    expect(() => createBlankWorkspace(" ")).toThrow();
  });
  it("adds all instrument kinds unbound and preserves colors/geometry through save and undo", () => {
    const blank = createBlankWorkspace("Panel", "panel");
    const populated = structuredClone(blank);
    const kinds = [
      "radial",
      "linear",
      "numeric",
      "led",
      "slider",
      "switch",
      "button",
      "thermometer",
    ] as Kind[];
    populated.screens[0].widgets = kinds.map((kind, index) =>
      createInstrument(kind, kind, index),
    );
    populated.screens[0].widgets[0].settings.color = "#268e94";
    const reopened = parseWorkspace(JSON.parse(JSON.stringify(populated)));
    expect(reopened.sources).toEqual([]);
    expect(
      reopened.screens[0].widgets.every((w) => w.binding === undefined),
    ).toBe(true);
    expect(JSON.stringify(reopened)).not.toContain("mock-motor");
    expect(reopened.screens[0].widgets[0].settings.color).toBe("#268e94");
    expect(
      undo(commit({ past: [], present: blank, future: [] }, reopened)).present,
    ).toEqual(blank);
  });
  it("document replacement clears edit history and invalidates previous session frames and editor commands", () => {
    const motor = initialWorkspace(),
      previous = { ...initialSim(), epoch: 8, running: true, tick: 23 };
    const opened = beginDocument(motor, previous, "/saved/motor.json");
    expect(opened.history.past).toEqual([]);
    expect(opened.filePath).toBe("/saved/motor.json");
    expect(isDocumentDirty(opened.history.present, opened.saved)).toBe(false);
    const blank = beginDocument(
      createBlankWorkspace("New"),
      opened.sim,
      null,
      true,
    );
    expect(blank.filePath).toBe(null);
    expect(blank.sim.running).toBe(false);
    expect(blank.sim.epoch).toBe(10);
    expect(blank.sim.tick).toBe(0);
    expect(blank.sim.history).toEqual([]);
    expect(isDocumentDirty(blank.history.present, blank.saved)).toBe(true);
    expect(
      acceptWorkerFrame({ ...blank.sim, running: true }, previous).epoch,
    ).toBe(10);
    expect(() => assertProjectEpoch(blank.sim, previous.epoch)).toThrow();
    expect(() => assertProjectEpoch(blank.sim, blank.sim.epoch)).not.toThrow();
    const reopened = beginDocument(motor, blank.sim);
    expect(() => assertProjectEpoch(reopened.sim, previous.epoch)).toThrow();
  });
  it("tracks dirty document content independently of session/layout and returns clean after undo", () => {
    const blank = createBlankWorkspace(),
      saved = JSON.stringify(blank);
    expect(isDocumentDirty(blank, saved)).toBe(false);
    const edited = structuredClone(blank);
    edited.screens[0].widgets.push(createInstrument("numeric", "numeric"));
    const h = commit({ past: [], present: blank, future: [] }, edited);
    expect(isDocumentDirty(h.present, saved)).toBe(true);
    expect(isDocumentDirty(undo(h).present, saved)).toBe(false);
  });
});
describe("original preview faces", () => {
  it("shows each unbound instrument face in Design without claiming a live reading or exposing interactive thumbnail controls", () => {
    for (const kind of [
      "radial",
      "linear",
      "numeric",
      "led",
      "slider",
      "switch",
      "button",
      "thermometer",
    ] as Kind[]) {
      const w = createInstrument(kind, kind);
      const face = renderToStaticMarkup(
        <Instrument w={w} value={NaN} running={false} onWrite={() => {}} />,
      );
      expect(face).toContain("<svg");
      expect(face).toContain("Design preview • unbound");
      expect(face).not.toContain("Simulated reading");
      const thumbnail = renderToStaticMarkup(
        <Instrument
          w={w}
          value={NaN}
          running={false}
          thumbnail
          onWrite={() => {}}
        />,
      );
      expect(thumbnail).not.toContain("<input");
      expect(thumbnail).not.toContain("<button");
    }
  });
  it("distinguishes unresolved binding previews from absent live readings and gives thermometer a separate vertical vector face", () => {
    const w = initialWorkspace().screens[0].widgets[0];
    const design = renderToStaticMarkup(
      <Instrument w={w} value={NaN} running={false} onWrite={() => {}} />,
    );
    expect(design).toContain("Design preview • unresolved binding");
    const live = renderToStaticMarkup(
      <Instrument w={w} value={NaN} running={true} onWrite={() => {}} />,
    );
    expect(live).toContain("Unresolved • no reading");
    expect(live).not.toContain("Design preview");
    const thermometer = renderToStaticMarkup(
      <Instrument
        w={createInstrument("thermometer", "thermo")}
        value={NaN}
        running={false}
        onWrite={() => {}}
      />,
    );
    expect(thermometer).toContain('viewBox="0 0 160 230"');
    expect(thermometer).toContain("thermometer-face");
  });
});
