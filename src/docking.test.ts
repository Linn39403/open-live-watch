import { it, expect } from "vitest";
import {
  defaultDockLayout,
  parseDockLayout,
  placePanel,
  setPanelLocation,
  dockNodes,
  reorderTab,
  clampWindowBounds,
  restoreNativeBounds,
  captureNativeBounds,
  logicalDecoration,
  migrateDockLayout,
} from "./docking";
it("validates a bounded unique split/tab layout and moves between all four auto-hide edges", () => {
  let layout = defaultDockLayout();
  expect(parseDockLayout(layout)).toEqual(layout);
  for (const edge of ["top", "bottom", "left", "right"] as const) {
    layout = setPanelLocation(layout, "properties", edge);
    expect(parseDockLayout(layout).autoHide[edge]).toContain("properties");
  }
  layout = placePanel(layout, "properties", "canvas", "left");
  expect(parseDockLayout(layout).autoHide.left).not.toContain("properties");
  const duplicate = structuredClone(layout);
  duplicate.hidden.push("properties");
  expect(() => parseDockLayout(duplicate)).toThrow("duplicate");
  const invalid = structuredClone(layout);
  if (invalid.root.type === "split") invalid.root.ratio = NaN;
  expect(() => parseDockLayout(invalid)).toThrow("ratio");
});
it("tab reordering and placement preserve exactly one canvas, fixed panel identity and serializable layout", () => {
  let layout = defaultDockLayout();
  const leaf = dockNodes(layout.root).find(
    (n) => n.type === "tabs" && n.panels.includes("explorer"),
  )!;
  layout = placePanel(layout, "toolbox", leaf.id, "tab");
  layout = reorderTab(layout, leaf.id, "toolbox", "explorer");
  const reordered = dockNodes(layout.root).find((n) => n.id === leaf.id);
  expect(reordered?.type === "tabs" && reordered.panels).toEqual([
    "toolbox",
    "explorer",
  ]);
  layout = placePanel(layout, "properties", leaf.id, "tab");
  expect(parseDockLayout(JSON.parse(JSON.stringify(layout)))).toEqual(layout);
  expect(
    dockNodes(layout.root).filter((n) => n.type === "canvas"),
  ).toHaveLength(1);
});
it("recovers off-screen native bounds and safely migrates old floating layouts", () => {
  expect(
    clampWindowBounds({ x: 9000, y: -500, width: 900, height: 900 }, [
      { x: -1280, y: 0, width: 1280, height: 720 },
    ]),
  ).toEqual({ x: -900, y: 0, width: 900, height: 720 });
  const migrated = migrateDockLayout({
    version: 1,
    panels: {
      explorer: "left",
      toolbox: "hidden",
      symbols: "bottom",
      properties: "floating",
    },
  });
  expect(parseDockLayout(migrated).hidden).toContain("toolbox");
  expect(migrated.floating).toHaveLength(0);
});
it("rejects partial native bounds and never treats persisted screen names as authority", () => {
  const layout = setPanelLocation(
    defaultDockLayout(),
    "properties",
    "floating",
  );
  for (const bounds of [{}, { x: 1, y: 2 }, { width: 500, height: 300 }]) {
    (layout.floating[0] as any).bounds = bounds;
    expect(() => parseDockLayout(layout)).toThrow("bounds");
  }
  delete layout.floating[0].bounds;
  layout.floating.push({ panel: "screen:deleted" });
  expect(() => migrateDockLayout(layout)).toThrow("Unknown");
  const valid = defaultDockLayout();
  const leaf = dockNodes(valid.root).find(
    (n) => n.type === "tabs" && n.panels.includes("explorer"),
  )!;
  expect(reorderTab(valid, leaf.id, "explorer", "explorer")).toEqual(valid);
});

it("restores monitor-local client bounds without decoration growth on mixed-DPI work areas", () => {
  const monitors = [
    {
      name: "primary",
      scaleFactor: 1,
      workArea: {
        position: { x: 0, y: 0 },
        size: { width: 1920, height: 1040 },
      },
    },
    {
      name: "secondary",
      scaleFactor: 2,
      workArea: {
        position: { x: 1920, y: 40 },
        size: { width: 2560, height: 1400 },
      },
    },
  ];
  const saved = captureNativeBounds(
    { x: 2120, y: 140 },
    { width: 1200, height: 800 },
    2,
    monitors,
  );
  expect(saved).toEqual({
    monitorHint: "secondary",
    bounds: { x: 100, y: 50, width: 600, height: 400 },
  });
  const restored = restoreNativeBounds(
    saved.bounds,
    saved.monitorHint,
    monitors,
    { width: 16, height: 60 },
  );
  expect(restored).toMatchObject({ x: 2120, y: 140, width: 600, height: 400 });
  expect(
    captureNativeBounds(
      { x: restored.x, y: restored.y },
      { width: restored.width * 2, height: restored.height * 2 },
      2,
      monitors,
    ),
  ).toEqual(saved);
  const recovered = restoreNativeBounds(
    { x: 9000, y: 9000, width: 1500, height: 1000 },
    "disconnected",
    monitors,
    { width: 16, height: 60 },
  );
  expect(recovered.x + recovered.width + 16).toBeLessThanOrEqual(1920);
  expect(recovered.y + recovered.height + 60).toBeLessThanOrEqual(1040);
});

it("normalizes initial-display decorations and uses current monitor near shared borders", () => {
  const monitors = [
    {
      name: "primary",
      scaleFactor: 1,
      workArea: {
        position: { x: 0, y: 0 },
        size: { width: 1920, height: 1040 },
      },
    },
    {
      name: "secondary",
      scaleFactor: 2,
      workArea: {
        position: { x: 1920, y: 0 },
        size: { width: 2560, height: 1400 },
      },
    },
  ];
  const decoration = logicalDecoration(
    { width: 616, height: 480 },
    { width: 600, height: 450 },
    1,
  );
  const result = restoreNativeBounds(
    { x: 9000, y: 9000, width: 1200, height: 680 },
    "secondary",
    monitors,
    decoration,
  );
  expect(
    result.x + result.width * 2 + decoration.width * 2,
  ).toBeLessThanOrEqual(4480);
  expect(
    result.y + result.height * 2 + decoration.height * 2,
  ).toBeLessThanOrEqual(1400);
  const captured = captureNativeBounds(
    { x: 1912, y: 0 },
    { width: 1200, height: 800 },
    2,
    monitors,
  );
  expect(captured.monitorHint).toBe("secondary");
  expect(captured.bounds).toEqual({ x: -4, y: 0, width: 600, height: 400 });
});
