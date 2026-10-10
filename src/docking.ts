export type DockPanel = string;
export type DockEdge = "top" | "bottom" | "left" | "right";
export type DockNode =
  | { type: "canvas"; id: string }
  | { type: "tabs"; id: string; panels: DockPanel[]; active: DockPanel }
  | {
      type: "split";
      id: string;
      axis: "horizontal" | "vertical";
      ratio: number;
      first: DockNode;
      second: DockNode;
    };
export type WindowBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};
export type DockLayout = {
  version: 2;
  root: DockNode;
  autoHide: Record<DockEdge, DockPanel[]>;
  hidden: DockPanel[];
  floating: { panel: DockPanel; bounds?: WindowBounds; monitorHint?: string }[];
};
export const fixedPanels = ["explorer", "toolbox", "symbols", "properties"];
let counter = 0;
const id = () => `dock-${Date.now().toString(36)}-${++counter}`;
const tabs = (panels: string[]): DockNode => ({
  type: "tabs",
  id: id(),
  panels,
  active: panels[0],
});
export function defaultDockLayout(): DockLayout {
  return {
    version: 2,
    root: {
      type: "split",
      id: "root",
      axis: "horizontal",
      ratio: 0.18,
      first: {
        type: "split",
        id: "left-root",
        axis: "vertical",
        ratio: 0.35,
        first: tabs(["explorer"]),
        second: tabs(["toolbox"]),
      },
      second: {
        type: "split",
        id: "right-root",
        axis: "horizontal",
        ratio: 0.8,
        first: {
          type: "split",
          id: "bottom-root",
          axis: "vertical",
          ratio: 0.75,
          first: { type: "canvas", id: "canvas" },
          second: tabs(["symbols"]),
        },
        second: tabs(["properties"]),
      },
    },
    autoHide: { top: [], bottom: [], left: [], right: [] },
    hidden: [],
    floating: [],
  };
}
function object(v: any) {
  return v && typeof v === "object" && !Array.isArray(v);
}
function exact(v: any, keys: string[]) {
  if (!object(v) || Object.keys(v).some((k) => !keys.includes(k)))
    throw new Error("Unknown dock layout fields");
}
export function parseDockLayout(
  input: unknown,
  allowed: string[] = fixedPanels,
): DockLayout {
  const value = input as any;
  exact(value, ["version", "root", "autoHide", "hidden", "floating"]);
  if (value.version !== 2) throw new Error("Unsupported layout version");
  let nodes = 0,
    canvases = 0;
  const ids = new Set<string>(),
    panels = new Set<string>();
  const panel = (p: any) => {
    if (typeof p !== "string" || !allowed.includes(p) || panels.has(p))
      throw new Error("Unknown or duplicate dock panel");
    panels.add(p);
  };
  function walk(n: any, depth: number): DockNode {
    if (++nodes > 32 || depth > 8) throw new Error("Dock tree limit exceeded");
    if (
      !object(n) ||
      typeof n.id !== "string" ||
      !n.id ||
      n.id.length > 128 ||
      ids.has(n.id)
    )
      throw new Error("Invalid dock node identity");
    ids.add(n.id);
    if (n.type === "canvas") {
      exact(n, ["type", "id"]);
      canvases++;
      return { ...n };
    }
    if (n.type === "tabs") {
      exact(n, ["type", "id", "panels", "active"]);
      if (!Array.isArray(n.panels) || !n.panels.length || n.panels.length > 20)
        throw new Error("Invalid panel tabs");
      n.panels.forEach(panel);
      if (!n.panels.includes(n.active)) throw new Error("Missing active tab");
      return { ...n, panels: [...n.panels] };
    }
    if (n.type === "split") {
      exact(n, ["type", "id", "axis", "ratio", "first", "second"]);
      if (
        !["horizontal", "vertical"].includes(n.axis) ||
        typeof n.ratio !== "number" ||
        !Number.isFinite(n.ratio) ||
        n.ratio < 0.1 ||
        n.ratio > 0.9
      )
        throw new Error("Invalid split ratio");
      return {
        ...n,
        first: walk(n.first, depth + 1),
        second: walk(n.second, depth + 1),
      };
    }
    throw new Error("Unknown dock node");
  }
  const root = walk(value.root, 0);
  if (canvases !== 1) throw new Error("Layout requires exactly one canvas");
  exact(value.autoHide, ["top", "bottom", "left", "right"]);
  const autoHide = {} as Record<DockEdge, string[]>;
  for (const edge of ["top", "bottom", "left", "right"] as DockEdge[]) {
    if (!Array.isArray(value.autoHide[edge]))
      throw new Error("Invalid auto-hide strip");
    value.autoHide[edge].forEach(panel);
    autoHide[edge] = [...value.autoHide[edge]];
  }
  if (
    !Array.isArray(value.hidden) ||
    !Array.isArray(value.floating) ||
    value.floating.length > 16
  )
    throw new Error("Invalid floating panel list");
  value.hidden.forEach(panel);
  const floating = value.floating.map((f: any) => {
    exact(f, ["panel", "bounds", "monitorHint"]);
    panel(f.panel);
    if (
      f.monitorHint !== undefined &&
      (typeof f.monitorHint !== "string" || f.monitorHint.length > 256)
    )
      throw new Error("Invalid monitor hint");
    if (f.bounds !== undefined) {
      exact(f.bounds, ["x", "y", "width", "height"]);
      if (
        ["x", "y", "width", "height"].some(
          (k) =>
            typeof f.bounds[k] !== "number" ||
            !Number.isFinite(f.bounds[k]) ||
            Math.abs(f.bounds[k]) > 100000,
        ) ||
        f.bounds.width < 240 ||
        f.bounds.height < 160
      )
        throw new Error("Invalid native bounds");
    }
    return structuredClone(f);
  });
  if (fixedPanels.some((p) => !panels.has(p)))
    throw new Error("Layout omitted a fixed panel");
  return { version: 2, root, autoHide, hidden: [...value.hidden], floating };
}
export function mapDockNode(
  root: DockNode,
  nodeId: string,
  update: (node: DockNode) => DockNode,
): DockNode {
  if (root.id === nodeId) return update(root);
  return root.type === "split"
    ? {
        ...root,
        first: mapDockNode(root.first, nodeId, update),
        second: mapDockNode(root.second, nodeId, update),
      }
    : root;
}
export function dockNodes(root: DockNode): DockNode[] {
  return root.type === "split"
    ? [root, ...dockNodes(root.first), ...dockNodes(root.second)]
    : [root];
}
export function detachPanel(layout: DockLayout, panel: string): DockLayout {
  const next = structuredClone(layout);
  function remove(n: DockNode): DockNode | null {
    if (n.type === "tabs") {
      const panels = n.panels.filter((p) => p !== panel);
      return panels.length
        ? {
            ...n,
            panels,
            active: panels.includes(n.active) ? n.active : panels[0],
          }
        : null;
    }
    if (n.type === "split") {
      const first = remove(n.first),
        second = remove(n.second);
      return first && second ? { ...n, first, second } : (first ?? second);
    }
    return n;
  }
  next.root = remove(next.root)!;
  for (const edge of ["top", "bottom", "left", "right"] as DockEdge[])
    next.autoHide[edge] = next.autoHide[edge].filter((p) => p !== panel);
  next.hidden = next.hidden.filter((p) => p !== panel);
  next.floating = next.floating.filter((f) => f.panel !== panel);
  return next;
}
export function placePanel(
  layout: DockLayout,
  panel: string,
  targetId: string,
  placement: DockEdge | "tab",
): DockLayout {
  const targetBefore = dockNodes(layout.root).find((n) => n.id === targetId);
  if (!targetBefore) throw new Error("Dock target disappeared");
  const next = detachPanel(layout, panel);
  let target = dockNodes(next.root).find((n) => n.id === targetId);
  if (!target) target = next.root;
  next.root = mapDockNode(next.root, target.id, (n) => {
    if (placement === "tab" && n.type === "tabs")
      return { ...n, panels: [...n.panels, panel], active: panel };
    const edge = placement === "tab" ? "right" : placement;
    const incoming = tabs([panel]);
    return {
      type: "split",
      id: id(),
      axis: edge === "left" || edge === "right" ? "horizontal" : "vertical",
      ratio: edge === "left" || edge === "top" ? 0.25 : 0.75,
      first: edge === "left" || edge === "top" ? incoming : n,
      second: edge === "left" || edge === "top" ? n : incoming,
    };
  });
  return next;
}
export function setPanelLocation(
  layout: DockLayout,
  panel: string,
  location: "hidden" | "floating" | DockEdge,
): DockLayout {
  const next = detachPanel(layout, panel);
  if (location === "hidden") next.hidden.push(panel);
  else if (location === "floating") next.floating.push({ panel });
  else next.autoHide[location].push(panel);
  return next;
}
export function reorderTab(
  layout: DockLayout,
  nodeId: string,
  panel: string,
  before: string,
): DockLayout {
  return {
    ...layout,
    root: mapDockNode(layout.root, nodeId, (n) => {
      if (
        panel === before ||
        n.type !== "tabs" ||
        !n.panels.includes(panel) ||
        !n.panels.includes(before)
      )
        return n;
      const panels = n.panels.filter((p) => p !== panel);
      panels.splice(panels.indexOf(before), 0, panel);
      return { ...n, panels };
    }),
  };
}
export function clampWindowBounds(
  bounds: WindowBounds,
  monitors: WindowBounds[],
): WindowBounds {
  const available = monitors.length
    ? monitors
    : [{ x: 0, y: 0, width: 1280, height: 720 }];
  const monitor =
    available.find(
      (m) =>
        bounds.x + 80 > m.x &&
        bounds.x < m.x + m.width - 80 &&
        bounds.y + 40 > m.y &&
        bounds.y < m.y + m.height - 40,
    ) ?? available[0];
  const width = Math.max(240, Math.min(bounds.width, monitor.width)),
    height = Math.max(160, Math.min(bounds.height, monitor.height));
  return {
    width,
    height,
    x: Math.max(
      monitor.x,
      Math.min(bounds.x, monitor.x + monitor.width - width),
    ),
    y: Math.max(
      monitor.y,
      Math.min(bounds.y, monitor.y + monitor.height - height),
    ),
  };
}
// Bounds x/y are logical offsets from the selected monitor work-area origin.
// Width/height are logical CLIENT dimensions, never decorated outer dimensions.
export type NativeMonitor = {
  name: string | null;
  scaleFactor: number;
  workArea: {
    position: { x: number; y: number };
    size: { width: number; height: number };
  };
};
export function monitorIdentity(m: NativeMonitor): string {
  return m.name ?? `display:${m.workArea.position.x},${m.workArea.position.y}`;
}
export function logicalDecoration(
  outer: { width: number; height: number },
  inner: { width: number; height: number },
  sourceScale: number,
) {
  return {
    width: Math.max(0, (outer.width - inner.width) / sourceScale),
    height: Math.max(0, (outer.height - inner.height) / sourceScale),
  };
}
export function restoreNativeBounds(
  bounds: WindowBounds | undefined,
  hint: string | undefined,
  monitors: NativeMonitor[],
  decoration = { width: 0, height: 0 },
) {
  const monitor =
    monitors.find((m) => monitorIdentity(m) === hint) ?? monitors[0];
  if (!monitor) throw new Error("No available display for floating window");
  const scale = monitor.scaleFactor,
    area = monitor.workArea;
  if (!Number.isFinite(scale) || scale <= 0)
    throw new Error("Invalid display scale");
  const outerWidth = area.size.width / scale,
    outerHeight = area.size.height / scale;
  const width = Math.max(
    240,
    Math.min(bounds?.width ?? 600, outerWidth - decoration.width),
  );
  const height = Math.max(
    160,
    Math.min(bounds?.height ?? 450, outerHeight - decoration.height),
  );
  const x = Math.max(
    0,
    Math.min(bounds?.x ?? 40, outerWidth - width - decoration.width),
  );
  const y = Math.max(
    0,
    Math.min(bounds?.y ?? 40, outerHeight - height - decoration.height),
  );
  return {
    width,
    height,
    x: Math.round(area.position.x + x * scale),
    y: Math.round(area.position.y + y * scale),
    monitorHint: monitorIdentity(monitor),
  };
}
export function captureNativeBounds(
  position: { x: number; y: number },
  client: { width: number; height: number },
  scale: number,
  monitors: NativeMonitor[],
  currentMonitorHint?: string,
) {
  const monitor =
    monitors.find((m) => monitorIdentity(m) === currentMonitorHint) ??
    [...monitors].sort((a, b) => {
      const intersection = (m: NativeMonitor) =>
        Math.max(
          0,
          Math.min(
            position.x + client.width,
            m.workArea.position.x + m.workArea.size.width,
          ) - Math.max(position.x, m.workArea.position.x),
        ) *
        Math.max(
          0,
          Math.min(
            position.y + client.height,
            m.workArea.position.y + m.workArea.size.height,
          ) - Math.max(position.y, m.workArea.position.y),
        );
      return intersection(b) - intersection(a);
    })[0] ??
    monitors[0];
  if (!monitor) throw new Error("No available display for floating window");
  return {
    monitorHint: monitorIdentity(monitor),
    bounds: {
      x: (position.x - monitor.workArea.position.x) / monitor.scaleFactor,
      y: (position.y - monitor.workArea.position.y) / monitor.scaleFactor,
      width: client.width / scale,
      height: client.height / scale,
    },
  };
}
export function migrateDockLayout(
  value: any,
  allowed: string[] = fixedPanels,
): DockLayout {
  if (value?.version === 2) return parseDockLayout(value, allowed);
  let next = defaultDockLayout();
  if (value?.version === 1 && object(value.panels)) {
    for (const panel of fixedPanels) {
      const edge = value.panels[panel];
      if (edge === "hidden") next = setPanelLocation(next, panel, "hidden");
      else if (["left", "right", "bottom", "top"].includes(edge))
        next = placePanel(
          next,
          panel,
          "canvas",
          edge,
        ); /* old float lacked recoverable window bounds; redock it */
    }
  }
  return next;
}
export function dockPanelLocations(
  layout: DockLayout,
): Record<string, "left" | "right" | "bottom" | "top" | "floating" | "hidden"> {
  const result: Record<string, any> = {};
  for (const node of dockNodes(layout.root))
    if (node.type === "tabs")
      for (const panel of node.panels) result[panel] = "left";
  for (const edge of ["top", "bottom", "left", "right"] as DockEdge[])
    for (const panel of layout.autoHide[edge]) result[panel] = edge;
  for (const panel of layout.hidden) result[panel] = "hidden";
  for (const f of layout.floating) result[f.panel] = "floating";
  return result;
}
export function parseStoredDockLayout(input: unknown): DockLayout {
  const raw = input as any,
    panels: string[] = [],
    pending = [{ node: raw?.root, depth: 0 }];
  let count = 0;
  while (pending.length) {
    const item = pending.pop()!;
    if (++count > 32 || item.depth > 8)
      throw new Error("Stored dock tree limit exceeded");
    const n = item.node;
    if (!n || typeof n !== "object")
      throw new Error("Invalid stored dock tree");
    if (n.type === "split")
      pending.push(
        { node: n.first, depth: item.depth + 1 },
        { node: n.second, depth: item.depth + 1 },
      );
    else if (n.type === "tabs") {
      if (!Array.isArray(n.panels) || n.panels.length > 20)
        throw new Error("Invalid stored tabs");
      panels.push(...n.panels);
    }
  }
  for (const list of [raw?.hidden, ...Object.values(raw?.autoHide ?? {})]) {
    if (!Array.isArray(list) || list.length > 80)
      throw new Error("Invalid stored panel list");
    panels.push(...list);
  }
  if (!Array.isArray(raw?.floating) || raw.floating.length > 16)
    throw new Error("Invalid stored floats");
  panels.push(...raw.floating.map((f: any) => f?.panel));
  const screens = panels.filter(
    (p) => typeof p === "string" && p.startsWith("screen:"),
  );
  return parseDockLayout(raw, [...fixedPanels, ...screens]);
}
