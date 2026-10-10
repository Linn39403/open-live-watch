import { describe, it, expect } from "vitest";
import {
  createBlankWorkspace,
  createInstrument,
  parseWorkspace,
} from "./model";
import {
  bounds,
  editorCommand,
  expandGroups,
  marqueeSelection,
  pasteWidgets,
  vacantPosition,
  transformSelection,
  movableSelection,
  resizeSelectionByFactor,
} from "./editor";
const fixture = () => {
  const w = createBlankWorkspace();
  w.screens[0].widgets = [0, 1, 2].map((i) => {
    const widget = createInstrument("numeric", `widget-${i}`);
    widget.rect = {
      x: 40 + i * 300,
      y: 40 + i * 100,
      width: 100,
      height: 100,
      rotation: 0,
    };
    return widget;
  });
  return w;
};
describe("screen-qualified editor commands", () => {
  it("applies requested child size exactly even when grouped children have a wide gap", () => {
    const s = fixture().screens[0];
    expect(
      resizeSelectionByFactor(
        s,
        s.widgets.map((w) => w.id),
        2,
      ),
    ).toBe(true);
    expect(s.widgets[0].rect.width).toBe(200);
    expect(s.widgets[1].rect.x - s.widgets[0].rect.x).toBe(600);
  });
  it("pastes copied widgets only into the current renamed destination screen", () => {
    const w = fixture(),
      clipboard = structuredClone(w.screens[0].widgets.slice(0, 1));
    w.screens.push({
      id: "controls",
      name: "Controls",
      kind: "dashboard",
      canvas: structuredClone(w.screens[0].canvas),
      widgets: [],
    });
    const result = pasteWidgets(w, "controls", clipboard, () => "new-copy");
    expect(result.workspace.screens.map((s) => s.name)).toEqual([
      w.screens[0].name,
      "Controls",
    ]);
    expect(result.workspace.screens[0].widgets).toHaveLength(3);
    expect(result.workspace.screens[1].widgets.map((w) => w.id)).toEqual([
      "new-copy",
    ]);
  });
  it("blocks unlocked children of locked groups for pointer and keyboard transforms", () => {
    const screen = fixture().screens[0];
    screen.widgets[0].groupId = screen.widgets[1].groupId = "locked-group";
    screen.widgets[0].locked = true;
    expect(
      movableSelection(screen, ["widget-0", "widget-1", "widget-2"]),
    ).toEqual(["widget-2"]);
    expect(movableSelection(screen, ["widget-1"])).toEqual([]);
  });
  it("rotates and uniformly resizes collective geometry while preserving children", () => {
    const s = fixture().screens[0],
      before = structuredClone(s.widgets);
    const ids = s.widgets.map((w) => w.id);
    expect(transformSelection(s, ids, "rotate", 90, 0)).toBe(true);
    expect(s.widgets.every((w) => w.rect.rotation === 90)).toBe(true);
    const oldDistance = Math.hypot(
      before[1].rect.x - before[0].rect.x,
      before[1].rect.y - before[0].rect.y,
    );
    expect(
      Math.hypot(
        s.widgets[1].rect.x - s.widgets[0].rect.x,
        s.widgets[1].rect.y - s.widgets[0].rect.y,
      ),
    ).toBeCloseTo(oldDistance);
    expect(transformSelection(s, ids, "se", 100, 100)).toBe(true);
    expect(
      s.widgets.every(
        (w) => w.rect.width === w.rect.height && w.rect.rotation === 90,
      ),
    ).toBe(true);
  });
  it("persists locks/groups and enforces screen identity", () => {
    const w = fixture(),
      s = w.screens[0];
    const grouped = editorCommand(
      w,
      s.id,
      ["widget-0", "widget-1"],
      "group",
      () => "group-1",
    );
    const locked = editorCommand(grouped, s.id, ["widget-0"], "lock");
    expect(
      parseWorkspace(locked)
        .screens[0].widgets.slice(0, 2)
        .every((w) => w.locked && w.groupId === "group-1"),
    ).toBe(true);
    expect(
      editorCommand(locked, s.id, ["widget-0"], "delete").screens[0].widgets,
    ).toHaveLength(3);
    expect(() => editorCommand(w, "old-screen", [], "front")).toThrow();
  });
  it("moves grouped alignment and clipboard geometry as units with independent identities", () => {
    const w = fixture(),
      s = w.screens[0];
    s.widgets[0].groupId = s.widgets[1].groupId = "old-group";
    const aligned = editorCommand(
      w,
      s.id,
      ["widget-0", "widget-2"],
      "align-top",
    );
    expect(
      aligned.screens[0].widgets[1].rect.y -
        aligned.screens[0].widgets[0].rect.y,
    ).toBe(100);
    let i = 0;
    const pasted = pasteWidgets(
      w,
      s.id,
      s.widgets.slice(0, 2),
      () => `fresh-${++i}`,
    );
    const copies = pasted.workspace.screens[0].widgets.slice(-2);
    expect(copies[1].rect.x - copies[0].rect.x).toBe(300);
    expect(copies[1].rect.y - copies[0].rect.y).toBe(100);
    expect(copies[0].groupId).toBe(copies[1].groupId);
    expect(copies[0].groupId).not.toBe("old-group");
    expect(
      new Set(
        pasted.workspace.screens.flatMap((s) => s.widgets.map((w) => w.id)),
      ).size,
    ).toBe(5);
  });
  it("uses rotated selection bounds and expands groups while preserving locked geometry", () => {
    const w = fixture(),
      s = w.screens[0];
    s.widgets[0].rect.rotation = 90;
    s.widgets[0].rect.width = 200;
    s.widgets[0].groupId = s.widgets[1].groupId = "g";
    s.widgets[0].locked = true;
    expect(bounds(s.widgets[0].rect).height).toBeCloseTo(200);
    expect(expandGroups(s, ["widget-0"])).toEqual(["widget-0", "widget-1"]);
    expect(marqueeSelection(s, { x: 95, y: 0, width: 30, height: 15 })).toEqual(
      ["widget-0", "widget-1"],
    );
    const result = editorCommand(
      w,
      s.id,
      ["widget-0", "widget-2"],
      "align-right",
    );
    expect(result.screens[0].widgets[0].rect).toEqual(s.widgets[0].rect);
    expect(result.screens[0].widgets[1].rect).toEqual(s.widgets[1].rect);
  });
  it("orders a selection without changing relative order and rejects foreign clipboard bindings", () => {
    const w = fixture(),
      s = w.screens[0];
    expect(
      editorCommand(
        w,
        s.id,
        ["widget-0", "widget-1"],
        "front",
      ).screens[0].widgets.map((w) => w.id),
    ).toEqual(["widget-2", "widget-0", "widget-1"]);
    const copy = createInstrument("numeric", "copy");
    copy.binding = {
      sourceId: "foreign",
      symbolPath: "value",
      gain: 1,
      offset: 0,
      units: "",
      periodMs: 50,
      writable: false,
    };
    expect(() => pasteWidgets(w, s.id, [copy])).toThrow();
  });
  it("searches vacant slots without scanning enormous canvas grids", () => {
    const w = fixture(),
      s = w.screens[0];
    s.canvas.width = s.canvas.height = 1e12;
    s.canvas.grid = 0.00001;
    const placed = vacantPosition(s, createInstrument("numeric", "new").rect);
    expect(
      s.widgets.some(
        (w) =>
          placed.x < w.rect.x + w.rect.width &&
          placed.x + placed.width > w.rect.x &&
          placed.y < w.rect.y + w.rect.height &&
          placed.y + placed.height > w.rect.y,
      ),
    ).toBe(false);
  });
});
