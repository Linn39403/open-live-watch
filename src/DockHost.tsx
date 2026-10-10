import { useRef, useState, type ReactNode } from "react";
import {
  mapDockNode,
  placePanel,
  reorderTab,
  type DockLayout,
  type DockNode,
  type DockEdge,
} from "./docking";
const labels: Record<string, string> = {
  explorer: "Explorer",
  toolbox: "Toolbox",
  symbols: "Symbol Browser",
  properties: "Properties",
};
export function DockHost({
  layout,
  onChange,
  canvas,
  renderPanel,
}: {
  layout: DockLayout;
  onChange: (layout: DockLayout) => void;
  canvas: ReactNode;
  renderPanel: (panel: string) => ReactNode;
}) {
  const [dragging, setDragging] = useState(false),
    [drawer, setDrawer] = useState<{ panel: string; edge: DockEdge } | null>(
      null,
    );
  const split = useRef<{
    id: string;
    start: number;
    ratio: number;
    span: number;
    axis: string;
  } | null>(null);
  const update = (id: string, ratio: number) =>
    onChange({
      ...layout,
      root: mapDockNode(layout.root, id, (n) =>
        n.type === "split"
          ? { ...n, ratio: Math.max(0.1, Math.min(0.9, ratio)) }
          : n,
      ),
    });
  function drop(e: React.DragEvent, node: DockNode, edge: DockEdge | "tab") {
    const panel = e.dataTransfer.getData("panel");
    if (!panel) return;
    e.preventDefault();
    e.stopPropagation();
    if (panel) {
      onChange(placePanel(layout, panel, node.id, edge));
      setDragging(false);
    }
  }
  function nodeView(node: DockNode): ReactNode {
    if (node.type === "split")
      return (
        <div
          key={node.id}
          className={"dock-split " + node.axis}
          style={{
            flexDirection: node.axis === "horizontal" ? "row" : "column",
          }}
        >
          <div
            className="dock-child"
            style={{ flex: `0 0 calc(${node.ratio * 100}% - 3px)` }}
          >
            {nodeView(node.first)}
          </div>
          <div
            className="dock-divider"
            role="separator"
            aria-label="Resize dock split"
            aria-orientation={
              node.axis === "horizontal" ? "vertical" : "horizontal"
            }
            aria-valuenow={Math.round(node.ratio * 100)}
            tabIndex={0}
            onKeyDown={(e) => {
              if (
                ![
                  "ArrowLeft",
                  "ArrowRight",
                  "ArrowUp",
                  "ArrowDown",
                  "Escape",
                ].includes(e.key)
              )
                return;
              e.preventDefault();
              e.stopPropagation();
              if (e.key === "ArrowLeft" || e.key === "ArrowUp")
                update(node.id, node.ratio - 0.025);
              if (e.key === "ArrowRight" || e.key === "ArrowDown")
                update(node.id, node.ratio + 0.025);
              if (e.key === "Escape" && split.current) {
                update(split.current.id, split.current.ratio);
                split.current = null;
              }
            }}
            onPointerDown={(e) => {
              const box =
                e.currentTarget.parentElement!.getBoundingClientRect();
              split.current = {
                id: node.id,
                start: node.axis === "horizontal" ? e.clientX : e.clientY,
                ratio: node.ratio,
                span: node.axis === "horizontal" ? box.width : box.height,
                axis: node.axis,
              };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              const s = split.current;
              if (s)
                update(
                  s.id,
                  s.ratio +
                    ((s.axis === "horizontal" ? e.clientX : e.clientY) -
                      s.start) /
                      s.span,
                );
            }}
            onPointerCancel={() => {
              const s = split.current;
              if (s) update(s.id, s.ratio);
              split.current = null;
            }}
            onPointerUp={() => (split.current = null)}
            onLostPointerCapture={() => (split.current = null)}
          />
          <div className="dock-child" style={{ flex: "1 1 0" }}>
            {nodeView(node.second)}
          </div>
        </div>
      );
    const view =
      node.type === "canvas" ? (
        canvas
      ) : (
        <>
          <div className="dock-tabs" role="tablist" aria-label="Docked panels">
            {node.panels.map((panel) => (
              <button
                key={panel}
                role="tab"
                aria-selected={node.active === panel}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("panel", panel);
                  setDragging(true);
                }}
                onDragEnd={() => setDragging(false)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const dragged = e.dataTransfer.getData("panel");
                  if (!dragged) return;
                  e.preventDefault();
                  e.stopPropagation();
                  if (node.panels.includes(dragged))
                    onChange(reorderTab(layout, node.id, dragged, panel));
                  else drop(e, node, "tab");
                  setDragging(false);
                }}
                onClick={() =>
                  onChange({
                    ...layout,
                    root: mapDockNode(layout.root, node.id, (n) =>
                      n.type === "tabs" ? { ...n, active: panel } : n,
                    ),
                  })
                }
              >
                {labels[panel] ?? panel}
              </button>
            ))}
          </div>
          <div className="dock-tab-content">{renderPanel(node.active)}</div>
        </>
      );
    return (
      <div
        className={"dock-leaf " + (node.type === "canvas" ? "dock-canvas" : "")}
        key={node.id}
        onDragEnter={(e) => {
          if (Array.from(e.dataTransfer.types).includes("panel"))
            setDragging(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => drop(e, node, "tab")}
      >
        {view}
        {dragging && (
          <div className="dock-drop-targets">
            {(["top", "left", "tab", "right", "bottom"] as const).map(
              (edge) => (
                <div
                  key={edge}
                  className={"dock-target " + edge}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => drop(e, node, edge)}
                >
                  {edge === "tab" ? "Tab" : edge}
                </div>
              ),
            )}
          </div>
        )}
      </div>
    );
  }
  return (
    <div
      className="dock-host"
      onDragEnd={() => setDragging(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setDragging(false);
          setDrawer(null);
          if (split.current) {
            update(split.current.id, split.current.ratio);
            split.current = null;
          }
        }
      }}
    >
      {(["top", "left", "right", "bottom"] as DockEdge[]).map((edge) => (
        <div key={edge} className={"auto-hide-strip " + edge}>
          {layout.autoHide[edge].map((panel) => (
            <button
              key={panel}
              onClick={() =>
                setDrawer(drawer?.panel === panel ? null : { panel, edge })
              }
            >
              {labels[panel] ?? panel}
            </button>
          ))}
        </div>
      ))}
      <div className="dock-tree">{nodeView(layout.root)}</div>
      {drawer && (
        <div
          className={"auto-hide-drawer " + drawer.edge}
          onKeyDown={(e) => {
            if (e.key === "Escape") setDrawer(null);
          }}
        >
          <button className="drawer-close" onClick={() => setDrawer(null)}>
            Close auto-hide drawer
          </button>
          {renderPanel(drawer.panel)}
        </div>
      )}
    </div>
  );
}
