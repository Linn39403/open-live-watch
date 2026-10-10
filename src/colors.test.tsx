import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Instrument } from "./Instruments";
import { instrumentPalette, DEFAULT_COLOR } from "./colors";
import {
  initialWorkspace,
  parseWorkspace,
  commit,
  undo,
  redo,
  type Kind,
} from "./model";
describe("portable instrument appearance", () => {
  it("loads legacy workspaces with green defaults and roundtrips independent accent/needle colors with undo", () => {
    const original = initialWorkspace();
    expect(original.screens[0].widgets[0].settings.color).toBeUndefined();
    expect(
      instrumentPalette(original.screens[0].widgets[0].settings).color,
    ).toBe(DEFAULT_COLOR);
    const colored = structuredClone(original);
    colored.screens[0].widgets[0].settings.color = "#327fbd";
    colored.screens[0].widgets[0].settings.needleColor = "#F27C20";
    colored.screens[0].widgets[2].settings.color = "#8758b0";
    const roundtrip = parseWorkspace(JSON.parse(JSON.stringify(colored)));
    expect(roundtrip).toEqual(colored);
    expect(roundtrip.screens[0].widgets[1].settings.color).toBeUndefined();
    const history = commit(
      { past: [], present: original, future: [] },
      roundtrip,
    );
    expect(undo(history).present).toEqual(original);
    expect(redo(undo(history)).present).toEqual(roundtrip);
  });
  it.each([
    "green",
    "#fff",
    "#12345678",
    "url(https://example.com/a)",
    "red;position:fixed",
    "#ffffff\n",
    "",
  ])("rejects unsafe/unsupported saved color %s", (color) => {
    for (const key of ["color", "needleColor"]) {
      const w = initialWorkspace();
      (w.screens[0].widgets[0].settings as Record<string, unknown>)[key] =
        color;
      expect(() => parseWorkspace(w)).toThrow();
    }
  });
  it("renders every instrument with its own accent and a separately configured radial needle", () => {
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
      const widget = initialWorkspace().screens[0].widgets[0];
      widget.kind = kind;
      widget.settings.color = "#268e94";
      widget.settings.needleColor = "#cc1234";
      const markup = renderToStaticMarkup(
        <Instrument
          w={widget}
          value={
            kind === "led" || kind === "switch" || kind === "button"
              ? true
              : 1400
          }
          running={true}
          onWrite={() => {}}
        />,
      );
      expect(markup).toContain("--instrument-color:#268e94");
      if (kind === "radial") {
        expect(markup).toContain('stroke="#268e94"');
        expect(markup).toContain('stroke="#cc1234"');
      }
    }
  });
  it("chooses readable button text for bright and dark custom accents and keeps LED OFF distinct", () => {
    expect(instrumentPalette({ color: "#ffffff" }).buttonInk).toBe("#000000");
    expect(instrumentPalette({ color: "#000000" }).buttonInk).toBe("#ffffff");
    const widget = initialWorkspace().screens[0].widgets[2];
    widget.settings.color = "#ffffff";
    const off = renderToStaticMarkup(
      <Instrument w={widget} value={false} running={true} onWrite={() => {}} />,
    );
    const on = renderToStaticMarkup(
      <Instrument w={widget} value={true} running={true} onWrite={() => {}} />,
    );
    expect(off).toContain('class="led-face "');
    expect(on).toContain('class="led-face lit"');
  });
});
