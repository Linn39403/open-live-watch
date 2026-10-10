import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Instrument } from "./Instruments";
import {
  instrumentPalette,
  DEFAULT_COLORS,
  DEFAULT_NEEDLE_COLOR,
  defaultInstrumentColor,
  resetInstrumentColors,
  isHexColor,
  colorPresets,
} from "./colors";
import {
  initialWorkspace,
  parseWorkspace,
  commit,
  undo,
  redo,
  type Kind,
} from "./model";
describe("portable instrument appearance", () => {
  it("uses balanced per-kind defaults in faces and toolbox without adding serialized overrides", () => {
    expect(colorPresets.find((p) => p.name === "Green")?.color).toBe("#72a054");
    expect(new Set(Object.values(DEFAULT_COLORS)).size).toBeGreaterThan(3);
    for (const kind of Object.keys(DEFAULT_COLORS) as Kind[]) {
      const widget = initialWorkspace().screens[0].widgets[0];
      widget.kind = kind;
      expect(isHexColor(defaultInstrumentColor(kind))).toBe(true);
      expect(instrumentPalette(widget.settings, kind).needle).toBe(
        DEFAULT_NEEDLE_COLOR,
      );
      for (const thumbnail of [false, true]) {
        const markup = renderToStaticMarkup(
          <Instrument
            w={widget}
            value={NaN}
            running={false}
            thumbnail={thumbnail}
            onWrite={() => {}}
          />,
        );
        expect(markup).toContain(
          "--instrument-color:" + defaultInstrumentColor(kind),
        );
        if (kind === "numeric") expect(markup).toContain('fill="#f2f3ed"');
      }
      expect(widget.settings.color).toBeUndefined();
    }
  });
  it("preserves explicit accents/needles exactly and restores kind defaults with undo and save", () => {
    for (const kind of Object.keys(DEFAULT_COLORS) as Kind[]) {
      const custom = initialWorkspace();
      const widget = custom.screens[0].widgets[0];
      widget.kind = kind;
      widget.settings.color = "#Ab12Cd";
      widget.settings.needleColor = "#Fa9012";
      expect(instrumentPalette(widget.settings, kind).color).toBe("#Ab12Cd");
      expect(instrumentPalette(widget.settings, kind).needle).toBe("#Fa9012");
      const reset = structuredClone(custom);
      reset.screens[0].widgets[0].settings = resetInstrumentColors(
        widget.settings,
      );
      expect(reset.screens[0].widgets[0].settings.min).toBe(
        widget.settings.min,
      );
      expect(
        instrumentPalette(reset.screens[0].widgets[0].settings, kind).color,
      ).toBe(defaultInstrumentColor(kind));
      expect(
        instrumentPalette(reset.screens[0].widgets[0].settings, kind).needle,
      ).toBe(DEFAULT_NEEDLE_COLOR);
      expect(parseWorkspace(JSON.parse(JSON.stringify(reset)))).toEqual(reset);
      expect(reset.screens[0].widgets[0].settings).not.toHaveProperty("color");
      expect(reset.screens[0].widgets[0].settings).not.toHaveProperty(
        "needleColor",
      );
      expect(
        undo(commit({ past: [], present: custom, future: [] }, reset)).present,
      ).toEqual(custom);
    }
  });
  it("loads legacy workspaces with kind defaults and roundtrips independent accent/needle colors with undo", () => {
    const original = initialWorkspace();
    expect(original.screens[0].widgets[0].settings.color).toBeUndefined();
    expect(
      instrumentPalette(original.screens[0].widgets[0].settings, "radial")
        .color,
    ).toBe(defaultInstrumentColor("radial"));
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
    expect(instrumentPalette({ color: "#ffffff" }, "button").buttonInk).toBe(
      "#000000",
    );
    expect(instrumentPalette({ color: "#000000" }, "button").buttonInk).toBe(
      "#ffffff",
    );
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
