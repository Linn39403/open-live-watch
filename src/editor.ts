import {
  parseWorkspace,
  type Rect,
  type Widget,
  type Workspace,
} from "./model";
export type Screen = Workspace["screens"][number];
export type EditorAction =
  | "align-left"
  | "align-right"
  | "align-top"
  | "align-bottom"
  | "align-center-x"
  | "align-center-y"
  | "distribute-x"
  | "distribute-y"
  | "front"
  | "back"
  | "forward"
  | "backward"
  | "group"
  | "ungroup"
  | "lock"
  | "unlock"
  | "delete";
export function bounds(rect: Rect) {
  const angle = (rect.rotation * Math.PI) / 180;
  const width =
    Math.abs(rect.width * Math.cos(angle)) +
    Math.abs(rect.height * Math.sin(angle));
  const height =
    Math.abs(rect.width * Math.sin(angle)) +
    Math.abs(rect.height * Math.cos(angle));
  return {
    x: rect.x + (rect.width - width) / 2,
    y: rect.y + (rect.height - height) / 2,
    width,
    height,
  };
}
export function intersects(
  a: Pick<Rect, "x" | "y" | "width" | "height">,
  b: Pick<Rect, "x" | "y" | "width" | "height">,
) {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}
export function expandGroups(screen: Screen, ids: string[]) {
  const groups = new Set(
    screen.widgets
      .filter((w) => ids.includes(w.id) && w.groupId)
      .map((w) => w.groupId),
  );
  return screen.widgets
    .filter((w) => ids.includes(w.id) || (w.groupId && groups.has(w.groupId)))
    .map((w) => w.id);
}
export function movableSelection(screen: Screen, ids: string[]) {
  const groups = new Set(
    screen.widgets.filter((w) => w.locked && w.groupId).map((w) => w.groupId),
  );
  return screen.widgets
    .filter(
      (w) =>
        ids.includes(w.id) &&
        !w.locked &&
        (!w.groupId || !groups.has(w.groupId)),
    )
    .map((w) => w.id);
}
export function marqueeSelection(
  screen: Screen,
  rect: Pick<Rect, "x" | "y" | "width" | "height">,
) {
  return expandGroups(
    screen,
    screen.widgets
      .filter((w) => intersects(bounds(w.rect), rect))
      .map((w) => w.id),
  );
}
export function vacantPosition(
  screen: Screen,
  rect: Rect,
  origin = { x: 32, y: 32 },
) {
  const gap = 16,
    start = { x: Math.max(0, origin.x), y: Math.max(0, origin.y) };
  const candidatesX = [
    start.x,
    ...screen.widgets.map((w) => bounds(w.rect).x + bounds(w.rect).width + gap),
  ]
    .filter((x) => x >= start.x && x + rect.width <= screen.canvas.width)
    .sort((a, b) => a - b);
  const candidatesY = [
    start.y,
    ...screen.widgets.map(
      (w) => bounds(w.rect).y + bounds(w.rect).height + gap,
    ),
  ]
    .filter((y) => y >= start.y && y + rect.height <= screen.canvas.height)
    .sort((a, b) => a - b);
  let attempts = 0;
  for (const y of candidatesY)
    for (const x of candidatesX) {
      if (++attempts > 4096) break;
      if (
        !screen.widgets.some((w) =>
          intersects(
            {
              x: x - gap,
              y: y - gap,
              width: rect.width + gap * 2,
              height: rect.height + gap * 2,
            },
            bounds(w.rect),
          ),
        )
      )
        return { ...rect, x, y };
    }

  return { ...rect, x: Math.max(0, origin.x), y: Math.max(0, origin.y) };
}
export function overlapIds(screen: Screen, selected: string[]) {
  return screen.widgets
    .filter(
      (w) =>
        selected.includes(w.id) &&
        screen.widgets.some(
          (other) =>
            other.id !== w.id && intersects(bounds(w.rect), bounds(other.rect)),
        ),
    )
    .map((w) => w.id);
}
/** Group rotation and uniform resize preserve original child offsets and angles. */
export function transformSelection(
  screen: Screen,
  ids: string[],
  kind: string,
  dx: number,
  dy: number,
) {
  const selected = screen.widgets.filter((w) => ids.includes(w.id));
  const lockedGroups = new Set(
    selected.filter((w) => w.locked && w.groupId).map((w) => w.groupId),
  );
  const items = selected.filter(
    (w) => !w.locked && (!w.groupId || !lockedGroups.has(w.groupId)),
  );
  if (items.length < 2) return false;
  const shapes = items.map((w) => bounds(w.rect)),
    left = Math.min(...shapes.map((r) => r.x)),
    top = Math.min(...shapes.map((r) => r.y)),
    right = Math.max(...shapes.map((r) => r.x + r.width)),
    bottom = Math.max(...shapes.map((r) => r.y + r.height));
  const cx = (left + right) / 2,
    cy = (top + bottom) / 2;
  if (kind === "rotate") {
    const angle = (dx * Math.PI) / 180;
    for (const w of items) {
      const x = w.rect.x + w.rect.width / 2 - cx,
        y = w.rect.y + w.rect.height / 2 - cy;
      w.rect.x =
        cx + x * Math.cos(angle) - y * Math.sin(angle) - w.rect.width / 2;
      w.rect.y =
        cy + x * Math.sin(angle) + y * Math.cos(angle) - w.rect.height / 2;
      w.rect.rotation += dx;
    }
    return true;
  }
  if (kind === "move") return false;
  const sx = kind.includes("w") ? -dx : kind.includes("e") ? dx : 0,
    sy = kind.includes("n") ? -dy : kind.includes("s") ? dy : 0;
  const requested =
    1 +
    (Math.abs(sx / (right - left)) >= Math.abs(sy / (bottom - top))
      ? sx / (right - left)
      : sy / (bottom - top));
  const scale = Math.max(
    requested,
    ...items.map((w) => Math.max(64 / w.rect.width, 64 / w.rect.height)),
  );
  const ax = kind.includes("w") ? right : kind.includes("e") ? left : cx,
    ay = kind.includes("n") ? bottom : kind.includes("s") ? top : cy;
  for (const w of items) {
    const x = w.rect.x + w.rect.width / 2,
      y = w.rect.y + w.rect.height / 2;
    w.rect.width *= scale;
    w.rect.height *= scale;
    w.rect.x = ax + (x - ax) * scale - w.rect.width / 2;
    w.rect.y = ay + (y - ay) * scale - w.rect.height / 2;
  }
  return true;
}
export function resizeSelectionByFactor(
  screen: Screen,
  ids: string[],
  factor: number,
) {
  if (!Number.isFinite(factor) || factor <= 0)
    throw new Error("Invalid group scale");
  if (
    screen.widgets.some(
      (w) =>
        ids.includes(w.id) &&
        (w.rect.width * factor < 64 || w.rect.height * factor < 64),
    )
  )
    throw new Error("Group scale would make a child smaller than 64px");
  const shapes = screen.widgets
    .filter((w) => movableSelection(screen, ids).includes(w.id))
    .map((w) => bounds(w.rect));
  if (shapes.length < 2) return false;
  const width =
    Math.max(...shapes.map((r) => r.x + r.width)) -
    Math.min(...shapes.map((r) => r.x));
  return transformSelection(screen, ids, "se", width * (factor - 1), 0);
}
export function editorCommand(
  workspace: Workspace,
  screenId: string,
  selected: string[],
  action: EditorAction,
  idFactory: () => string = () => crypto.randomUUID(),
) {
  const next = structuredClone(workspace),
    screen = next.screens.find((s) => s.id === screenId);
  if (!screen) throw new Error("Screen belongs to a previous project");
  const ids = expandGroups(screen, selected);
  const chosen = screen.widgets.filter((w) => ids.includes(w.id));
  if (!chosen.length) return next;
  if (action === "lock" || action === "unlock")
    chosen.forEach((w) => (w.locked = action === "lock"));
  else if (action === "group") {
    const groupId = idFactory();
    chosen.filter((w) => !w.locked).forEach((w) => (w.groupId = groupId));
  } else if (action === "ungroup")
    chosen.filter((w) => !w.locked).forEach((w) => delete w.groupId);
  else if (action === "delete")
    screen.widgets = screen.widgets.filter(
      (w) => !ids.includes(w.id) || w.locked,
    );
  else if (["front", "back", "forward", "backward"].includes(action)) {
    if (action === "front" || action === "back") {
      const rest = screen.widgets.filter((w) => !ids.includes(w.id));
      screen.widgets =
        action === "front" ? [...rest, ...chosen] : [...chosen, ...rest];
    } else {
      const direction = action === "forward" ? 1 : -1,
        order =
          direction === 1 ? [...screen.widgets].reverse() : [...screen.widgets];
      for (const w of order) {
        const index = screen.widgets.indexOf(w),
          target = index + direction;
        if (
          ids.includes(w.id) &&
          target >= 0 &&
          target < screen.widgets.length &&
          !ids.includes(screen.widgets[target].id)
        )
          [screen.widgets[index], screen.widgets[target]] = [
            screen.widgets[target],
            screen.widgets[index],
          ];
      }
    }
  } else {
    const units = new Map<string, Widget[]>();
    for (const w of chosen) {
      const key = w.groupId ? "group:" + w.groupId : "widget:" + w.id;
      const items = units.get(key) ?? [];
      items.push(w);
      units.set(key, items);
    }
    const items = [...units.values()].map((widgets) => {
      const shapes = widgets.map((w) => bounds(w.rect));
      const x = Math.min(...shapes.map((r) => r.x)),
        y = Math.min(...shapes.map((r) => r.y));
      return {
        widgets,
        x,
        y,
        width: Math.max(...shapes.map((r) => r.x + r.width)) - x,
        height: Math.max(...shapes.map((r) => r.y + r.height)) - y,
        locked: widgets.some((w) => w.locked),
      };
    });
    const minX = Math.min(...items.map((w) => w.x)),
      maxX = Math.max(...items.map((w) => w.x + w.width)),
      minY = Math.min(...items.map((w) => w.y)),
      maxY = Math.max(...items.map((w) => w.y + w.height));
    const translate = (
      item: (typeof items)[number],
      dx: number,
      dy: number,
    ) => {
      if (!item.locked)
        for (const w of item.widgets) {
          w.rect.x += dx;
          w.rect.y += dy;
        }
    };
    if (action === "distribute-x" || action === "distribute-y") {
      const axis = action === "distribute-x" ? "x" : "y",
        size = axis === "x" ? "width" : "height",
        ordered = [...items].sort((a, b) => a[axis] - b[axis]);
      if (ordered.length < 3) return next;
      const first = ordered[0][axis],
        last = ordered.at(-1)![axis] + ordered.at(-1)![size],
        gap =
          (last - first - ordered.reduce((sum, w) => sum + w[size], 0)) /
          (ordered.length - 1);
      let position = first;
      for (const item of ordered) {
        translate(
          item,
          axis === "x" ? position - item.x : 0,
          axis === "y" ? position - item.y : 0,
        );
        position += item[size] + gap;
      }
    } else
      for (const item of items) {
        const targetX =
          action === "align-left"
            ? minX
            : action === "align-right"
              ? maxX - item.width
              : action === "align-center-x"
                ? (minX + maxX - item.width) / 2
                : item.x;
        const targetY =
          action === "align-top"
            ? minY
            : action === "align-bottom"
              ? maxY - item.height
              : action === "align-center-y"
                ? (minY + maxY - item.height) / 2
                : item.y;
        translate(item, targetX - item.x, targetY - item.y);
      }
  }

  return parseWorkspace(next);
}
export function pasteWidgets(
  workspace: Workspace,
  screenId: string,
  clipboard: Widget[],
  idFactory: () => string = () => crypto.randomUUID(),
) {
  const next = structuredClone(workspace),
    screen = next.screens.find((s) => s.id === screenId);
  if (!screen) throw new Error("Unknown screen");
  const groups = new Map<string, string>(),
    ids: string[] = [];
  if (!clipboard.length) return { workspace: next, ids };
  const shapes = clipboard.map((w) => bounds(w.rect)),
    minX = Math.min(...shapes.map((r) => r.x)),
    minY = Math.min(...shapes.map((r) => r.y));
  const shape = {
    x: minX,
    y: minY,
    width: Math.max(...shapes.map((r) => r.x + r.width)) - minX,
    height: Math.max(...shapes.map((r) => r.y + r.height)) - minY,
    rotation: 0,
  };
  const placement = vacantPosition(screen, shape);
  for (const source of clipboard) {
    const copy = structuredClone(source);
    copy.id = idFactory();
    ids.push(copy.id);
    if (copy.groupId) {
      if (!groups.has(copy.groupId)) groups.set(copy.groupId, idFactory());
      copy.groupId = groups.get(copy.groupId)!;
    }
    copy.rect.x += placement.x - minX;
    copy.rect.y += placement.y - minY;
    screen.widgets.push(copy);
  }
  return { workspace: parseWorkspace(next), ids };
}
