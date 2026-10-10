import { useEffect, useRef, useState } from "react";
import {
  initialWorkspace,
  initialSim,
  parseSim,
  acceptWorkerFrame,
  parseWorkspace,
  commit,
  undo,
  redo,
  step,
  writeWidget,
  bindingCompatible,
  moveDelta,
  symbols,
  type Workspace,
  type History,
  type Sim,
  type Widget,
  type Kind,
} from "./model";
import { Instrument } from "./Instruments";
type Panel = "explorer" | "toolbox" | "symbols" | "properties";
type Edge = "left" | "right" | "bottom" | "hidden" | "floating";
type Layout = Record<Panel, Edge>;
type Snapshot = {
  workspace: Workspace;
  sim: Sim;
  selected: string[];
  layout: Layout;
};
const defaults: Layout = {
  explorer: "left",
  toolbox: "left",
  properties: "right",
  symbols: "bottom",
};
const floating = new URLSearchParams(location.search).get(
  "panel",
) as Panel | null;
const desktop = "__TAURI_INTERNALS__" in window;
let publish: (message: unknown) => void = () => {};
type Command = { type: string; [key: string]: unknown };
export function App() {
  const [history, setHistory] = useState<History>({
    past: [],
    present: initialWorkspace(),
    future: [],
  });
  const [sim, setSim] = useState(initialSim);
  const [selected, setSelected] = useState<string[]>([]);
  const [layout, setLayout] = useState<Layout>(() => {
    try {
      const v = JSON.parse(localStorage.getItem("olw-layout") ?? "null");
      return v?.version === 1 &&
        Object.keys(defaults).every((k) =>
          ["left", "right", "bottom", "hidden", "floating"].includes(
            v.panels[k],
          ),
        )
        ? (Object.fromEntries(
            Object.entries(v.panels).map(([k, e]) => [
              k,
              e === "floating" ? defaults[k as Panel] : e,
            ]),
          ) as Layout)
        : defaults;
    } catch {
      return defaults;
    }
  });
  const [tab, setTab] = useState("Design");
  const [zoom, setZoom] = useState(1);
  const [snap, setSnap] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [locked, setLocked] = useState<string[]>([]);
  const current = useRef({ history, sim, selected, layout });
  current.current = { history, sim, selected, layout };
  const worker = useRef<Worker | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const gesture = useRef<{
    start: Workspace;
    x: number;
    y: number;
    scrollX: number;
    scrollY: number;
    kind: string;
    ids: string[];
  } | null>(null);
  const workspace = history.present,
    screen = workspace.screens[0],
    chosen = screen.widgets.find((w) => w.id === selected[0]);
  const replace = (w: Workspace) => {
    const validated = parseWorkspace(w);
    setHistory((h) => commit(h, validated));
  };
  function editWidget(id: string, patch: Partial<Widget>) {
    if (current.current.sim.running)
      throw new Error("Stop simulation before editing");
    if (patch.rect && locked.includes(id))
      throw new Error("Geometry is locked");
    const w = structuredClone(current.current.history.present);
    w.screens[0].widgets = w.screens[0].widgets.map((v) =>
      v.id === id ? { ...v, ...patch } : v,
    );
    replace(w);
  }
  function command(c: Command) {
    if (floating) {
      publish({ kind: "command", command: c });
      return;
    }
    try {
      if (c.type === "write") {
        const w = current.current.history.present.screens[0].widgets.find(
          (v) => v.id === c.id,
        );
        if (!w?.binding?.writable)
          throw new Error("Widget binding is read-only");
        const source = current.current.history.present.sources.find(
          (s) => s.id === w.binding!.sourceId,
        );
        if (source?.provider !== "mock")
          throw new Error("Unsupported simulator source");
        const next = writeWidget(
          current.current.sim,
          w,
          c.value,
          Number(c.epoch),
        );
        current.current.sim = next;
        setSim(next);
      }
      if (c.type === "select") setSelected([String(c.id)]);
      if (c.type === "dock") {
        setLayout((l) => ({ ...l, [String(c.panel)]: c.edge as Edge }));
        if (desktop)
          void import("@tauri-apps/api/webviewWindow")
            .then(async (m) => {
              const win = await m.WebviewWindow.getByLabel("panel-" + c.panel);
              await win?.destroy();
            })
            .catch((error) =>
              setError("Native redock failed: " + String(error)),
            );
      }
      if (c.type === "patch") {
        if (current.current.sim.running)
          throw new Error("Stop simulation before editing");
        editWidget(String(c.id), c.patch as Partial<Widget>);
      }
      if (c.type === "hello")
        publish({
          kind: "snapshot",
          data: {
            workspace: current.current.history.present,
            sim: current.current.sim,
            selected: current.current.selected,
            layout: current.current.layout,
          },
        });
    } catch (e) {
      setError(String(e));
    }
  }
  const commandRef = useRef(command);
  commandRef.current = command;
  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};
    if (desktop) {
      void import("@tauri-apps/api/event").then(async ({ emit, listen }) => {
        publish = (m) => void emit("olw-session", m);
        const unlisten = await listen("olw-session", (e) => receive(e.payload));
        if (cancelled) unlisten();
        else {
          cleanup = unlisten;
          publish({ kind: "command", command: { type: "hello" } });
        }
      });
    } else {
      const bc = new BroadcastChannel("olw-session");
      publish = (m) => bc.postMessage(m);
      bc.onmessage = (e) => receive(e.data);
      cleanup = () => bc.close();
      publish({ kind: "command", command: { type: "hello" } });
    }
    function receive(m: any) {
      if (!m || typeof m !== "object") return;
      if (!floating && m.kind === "command") commandRef.current(m.command);
      if (floating && m.kind === "snapshot") {
        try {
          const d = m.data as Snapshot;
          setHistory({
            past: [],
            present: parseWorkspace(d.workspace),
            future: [],
          });
          setSim(parseSim(d.sim));
          setSelected(d.selected);
          setLayout(d.layout);
        } catch {
          setError("Rejected invalid session snapshot");
        }
      }
    }
    return () => {
      cancelled = true;
      cleanup();
    };
  }, []);
  useEffect(() => {
    if (!floating)
      publish({ kind: "snapshot", data: { workspace, sim, selected, layout } });
  }, [workspace, sim, selected, layout]);
  useEffect(() => {
    if (floating) return;
    const w = new Worker(new URL("./simulator.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.current = w;
    w.onmessage = (e) => {
      try {
        const frame = parseSim(e.data);
        setSim((s) => acceptWorkerFrame(s, frame));
      } catch (error) {
        setError(String(error));
      }
    };
    w.postMessage(current.current.sim);
    return () => {
      w.terminate();
      worker.current = null;
    };
  }, []);
  useEffect(() => {
    if (!floating) worker.current?.postMessage(sim);
  }, [sim.epoch, sim.revision, sim.running]);
  useEffect(() => {
    if (!floating)
      localStorage.setItem(
        "olw-layout",
        JSON.stringify({ version: 1, panels: layout }),
      );
  }, [layout]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if ((e.target as HTMLElement).matches("input,select,textarea")) return;
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === "Escape" && gesture.current) {
        const start = gesture.current.start;
        gesture.current = null;
        setHistory((h) => ({ ...h, present: start }));
        return;
      }
      if (floating || current.current.sim.running) return;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        setHistory(e.shiftKey ? redo : undo);
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        setHistory(redo);
      }
      if (e.key === "Delete") remove();
      if (
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key) &&
        !sim.running
      ) {
        e.preventDefault();
        const w = structuredClone(current.current.history.present);
        for (const v of w.screens[0].widgets)
          if (selected.includes(v.id) && !locked.includes(v.id)) {
            v.rect.x +=
              (e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0) *
              (e.shiftKey ? 10 : 1);
            v.rect.y +=
              (e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0) *
              (e.shiftKey ? 10 : 1);
          }
        replace(w);
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [selected, sim.running, locked]);
  function add(kind: Kind) {
    const w = structuredClone(workspace);
    const symbol =
      kind === "led" || kind === "switch" || kind === "button"
        ? symbols[3]
        : kind === "slider"
          ? symbols[1]
          : symbols[0];
    const id = crypto.randomUUID();
    w.screens[0].widgets.push({
      id,
      kind,
      title: kind[0].toUpperCase() + kind.slice(1),
      rect: {
        x: 48 + (screen.widgets.length % 4) * 30,
        y: 48 + (screen.widgets.length % 4) * 30,
        width: 220,
        height: 170,
        rotation: 0,
      },
      binding: {
        sourceId: workspace.sources[0]?.id ?? "mock-motor",
        symbolPath: symbol.path,
        gain: 1,
        offset: 0,
        units: symbol.units,
        periodMs: 50,
        writable: ["slider", "switch", "button"].includes(kind),
      },
      settings: { min: 0, max: 3000, precision: 0 },
    });
    replace(w);
    setSelected([id]);
  }
  function remove() {
    const w = structuredClone(workspace);
    w.screens[0].widgets = w.screens[0].widgets.filter(
      (v) => !selected.includes(v.id),
    );
    replace(w);
    setSelected([]);
  }
  function duplicate() {
    const w = structuredClone(workspace),
      ids: string[] = [];
    for (const v of screen.widgets.filter((v) => selected.includes(v.id))) {
      const copy = structuredClone(v);
      copy.id = crypto.randomUUID();
      copy.rect.x += 24;
      copy.rect.y += 24;
      ids.push(copy.id);
      w.screens[0].widgets.push(copy);
    }
    replace(w);
    setSelected(ids);
  }
  function pointerStart(e: React.PointerEvent, id: string, kind = "move") {
    if (sim.running) return;
    e.stopPropagation();
    const ids = e.shiftKey
      ? [...new Set([...selected, id])]
      : selected.includes(id)
        ? selected
        : [id];
    setSelected(ids);
    if (locked.includes(id)) return;
    gesture.current = {
      start: structuredClone(workspace),
      x: e.clientX,
      y: e.clientY,
      scrollX: viewport.current?.scrollLeft ?? 0,
      scrollY: viewport.current?.scrollTop ?? 0,
      kind,
      ids,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function pointerMove(e: React.PointerEvent) {
    const g = gesture.current;
    if (!g) return;
    let dx =
        (e.clientX - g.x + (viewport.current?.scrollLeft ?? 0) - g.scrollX) /
        zoom,
      dy =
        (e.clientY - g.y + (viewport.current?.scrollTop ?? 0) - g.scrollY) /
        zoom;
    const quant = (v: number) =>
      moveDelta(v, screen.canvas.grid, snap && !e.altKey);
    const w = structuredClone(g.start);
    for (const v of w.screens[0].widgets.filter(
      (v) => g.ids.includes(v.id) && !locked.includes(v.id),
    )) {
      const r = v.rect;
      if (g.kind === "move") {
        r.x += quant(dx);
        r.y += quant(dy);
      } else if (g.kind === "rotate") {
        r.rotation += dx;
      } else {
        const rad = (-r.rotation * Math.PI) / 180;
        const localX = dx * Math.cos(rad) - dy * Math.sin(rad),
          localY = dx * Math.sin(rad) + dy * Math.cos(rad);
        let dw = 0,
          dh = 0;
        if (g.kind.includes("e")) dw = localX;
        if (g.kind.includes("w")) dw = -localX;
        if (g.kind.includes("s")) dh = localY;
        if (g.kind.includes("n")) dh = -localY;
        dw = Math.max(64 - r.width, dw);
        dh = Math.max(64 - r.height, dh);
        const sx = g.kind.includes("w") ? -dw / 2 : dw / 2,
          sy = g.kind.includes("n") ? -dh / 2 : dh / 2;
        const a = (r.rotation * Math.PI) / 180;
        r.x += sx * Math.cos(a) - sy * Math.sin(a) - dw / 2;
        r.y += sx * Math.sin(a) + sy * Math.cos(a) - dh / 2;
        r.width += dw;
        r.height += dh;
      }
    }
    setHistory((h) => ({ ...h, present: w }));
    const host = viewport.current;
    if (host) {
      const b = host.getBoundingClientRect();
      if (e.clientX > b.right - 25) host.scrollLeft += 15;
      if (e.clientY > b.bottom - 25) host.scrollTop += 15;
      if (e.clientX < b.left + 25) host.scrollLeft -= 15;
      if (e.clientY < b.top + 25) host.scrollTop -= 15;
    }
  }
  function pointerEnd() {
    const g = gesture.current;
    if (!g) return;
    gesture.current = null;
    setHistory((h) => commit({ ...h, present: g.start }, h.present));
  }
  async function float(panel: Panel) {
    setError("");
    if (!desktop) {
      setError(
        "Native floating panels require the desktop build. Use docking here.",
      );
      return;
    }
    try {
      const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
      const existing = await WebviewWindow.getByLabel("panel-" + panel);
      if (existing) {
        await existing.setFocus();
        return;
      }
      const win = new WebviewWindow("panel-" + panel, {
        url: "index.html?panel=" + panel,
        title: "Open Live Watch — " + panel,
        width: 600,
        height: 450,
        minWidth: 320,
        minHeight: 220,
      });
      await win.once("tauri://created", () =>
        setLayout((l) => ({ ...l, [panel]: "floating" })),
      );
      await win.once("tauri://error", (e) =>
        setError("Floating window failed: " + String(e.payload)),
      );
      await win.onCloseRequested(() =>
        setLayout((l) =>
          l[panel] === "floating" ? { ...l, [panel]: defaults[panel] } : l,
        ),
      );
    } catch (e) {
      setError(String(e));
    }
  }
  async function save() {
    try {
      const data = JSON.stringify(parseWorkspace(workspace), null, 2);
      if (desktop) {
        const { save } = await import("@tauri-apps/plugin-dialog");
        const path = await save({
          filters: [{ name: "Open Live Watch", extensions: ["json"] }],
        });
        if (path) {
          const { invoke } = await import("@tauri-apps/api/core");
          await invoke("save_workspace", { path, data });
        }
      } else download(data, "workspace.olw.json", "application/json");
    } catch (e) {
      setError(String(e));
    }
  }
  async function open() {
    try {
      if (desktop) {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const path = await open({
          multiple: false,
          filters: [{ name: "Open Live Watch", extensions: ["json"] }],
        });
        if (path) {
          const { invoke } = await import("@tauri-apps/api/core");
          replace(
            parseWorkspace(
              JSON.parse(await invoke<string>("load_workspace", { path })),
            ),
          );
          setSelected([]);
        }
      } else document.getElementById("workspace-file")?.click();
    } catch (e) {
      setError(String(e));
    }
  }
  function download(data: string, name: string, type: string) {
    const url = URL.createObjectURL(new Blob([data], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function content(panel: Panel) {
    if (panel === "explorer")
      return (
        <div className="tree">
          <strong>▾ {workspace.name}</strong>
          <div>▾ Screens</div>
          <div className="tree-selected">▣ {screen.name}</div>
          <div>▾ Simulator</div>
          <div>◉ Motor model • offline</div>
          <p>
            Click a toolbox instrument to add it. Shift-click selects multiple
            objects.
          </p>
        </div>
      );
    if (panel === "toolbox")
      return (
        <div className="toolbox">
          {(
            [
              "radial",
              "linear",
              "numeric",
              "led",
              "slider",
              "switch",
              "button",
              "thermometer",
            ] as Kind[]
          ).map((k) => (
            <button
              key={k}
              disabled={sim.running || !!floating}
              onClick={() => add(k)}
            >
              <span>
                {
                  {
                    radial: "◴",
                    linear: "▰",
                    numeric: "123",
                    led: "●",
                    slider: "↔",
                    switch: "◉",
                    button: "▣",
                    thermometer: "♨",
                  }[k]
                }
              </span>
              {k}
            </button>
          ))}
        </div>
      );
    if (panel === "symbols")
      return (
        <>
          <input
            className="search"
            aria-label="Search symbols"
            placeholder="Search simulated symbols…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <table>
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Type</th>
                <th>Value</th>
                <th>Access</th>
                <th>Quality</th>
              </tr>
            </thead>
            <tbody>
              {symbols
                .filter((s) => s.path.includes(query))
                .map((s) => (
                  <tr
                    key={s.path}
                    draggable={!floating}
                    onDragStart={(e) =>
                      e.dataTransfer.setData("symbol", s.path)
                    }
                  >
                    <td>{s.path}</td>
                    <td>{s.type}</td>
                    <td>
                      {typeof sim.values[s.path] === "boolean"
                        ? String(sim.values[s.path])
                        : Number(sim.values[s.path]).toFixed(1)}{" "}
                      {s.units}
                    </td>
                    <td>
                      {s.writable ? "Read / simulated write" : "Read only"}
                    </td>
                    <td>{sim.running ? "Good • simulated" : "Stopped"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </>
      );
    return chosen ? (
      <div className="properties">
        <label>
          Name
          <input
            value={chosen.title}
            disabled={sim.running}
            onChange={(e) =>
              command({
                type: "patch",
                id: chosen.id,
                patch: { title: e.target.value },
              })
            }
          />
        </label>
        <label>
          Binding
          <select
            value={chosen.binding?.symbolPath ?? ""}
            disabled={sim.running}
            onChange={(e) => {
              const s = symbols.find((s) => s.path === e.target.value)!;
              if (!bindingCompatible(chosen.kind, s.path)) {
                setError("Binding type is incompatible with instrument");
                return;
              }
              command({
                type: "patch",
                id: chosen.id,
                patch: {
                  binding: {
                    sourceId: "mock-motor",
                    symbolPath: s.path,
                    gain: 1,
                    offset: 0,
                    units: s.units,
                    periodMs: 50,
                    writable:
                      s.writable &&
                      ["slider", "switch", "button"].includes(chosen.kind),
                  },
                },
              });
            }}
          >
            {symbols.map((s) => (
              <option key={s.path}>{s.path}</option>
            ))}
          </select>
        </label>
        {(["x", "y", "width", "height", "rotation"] as const).map((key) => (
          <label key={key}>
            {key}
            <input
              type="number"
              value={Math.round(chosen.rect[key])}
              disabled={sim.running || locked.includes(chosen.id)}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (
                  Number.isFinite(n) &&
                  ((key !== "width" && key !== "height") || n >= 64)
                )
                  command({
                    type: "patch",
                    id: chosen.id,
                    patch: { rect: { ...chosen.rect, [key]: n } },
                  });
              }}
            />
          </label>
        ))}
        <label>
          <input
            type="checkbox"
            checked={locked.includes(chosen.id)}
            onChange={(e) =>
              setLocked((l) =>
                e.target.checked
                  ? [...l, chosen.id]
                  : l.filter((id) => id !== chosen.id),
              )
            }
          />
          Lock geometry (session)
        </label>
        <p>Drag a symbol row onto an instrument to bind it.</p>
      </div>
    ) : (
      <p className="empty">Select an instrument to edit its properties.</p>
    );
  }
  function panelView(panel: Panel) {
    return (
      <section
        className={"panel panel-" + panel}
        key={panel}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          const id = e.dataTransfer.getData("panel") as Panel;
          if (id in defaults) setLayout((l) => ({ ...l, [id]: layout[panel] }));
        }}
      >
        <header
          draggable={!floating}
          onDragStart={(e) => e.dataTransfer.setData("panel", panel)}
        >
          <strong>
            {panel === "symbols"
              ? "Symbol Browser"
              : panel[0].toUpperCase() + panel.slice(1)}
          </strong>
          <div>
            <select
              aria-label={"Dock " + panel}
              value={layout[panel]}
              onChange={(e) =>
                command({ type: "dock", panel, edge: e.target.value })
              }
            >
              {["left", "right", "bottom", "hidden", "floating"].map((edge) => (
                <option key={edge} disabled={edge === "floating"}>
                  {edge}
                </option>
              ))}
            </select>
            {!floating && (
              <button
                title="Float in native window"
                onClick={() => void float(panel)}
              >
                ↗
              </button>
            )}
            <button
              title={floating ? "Return to workspace" : "Hide panel"}
              onClick={() =>
                command({
                  type: "dock",
                  panel,
                  edge: floating ? defaults[panel] : "hidden",
                })
              }
            >
              {floating ? "Dock" : "×"}
            </button>
          </div>
        </header>
        <div className="panel-content">{content(panel)}</div>
      </section>
    );
  }
  if (floating)
    return (
      <div className="floating-panel">
        {panelView(floating)}
        <footer>
          Shared simulator session • {sim.running ? "RUN" : "DESIGN"} {error}
        </footer>
      </div>
    );
  return (
    <div className="app">
      <div className="titlebar">
        <span className="app-mark">◴</span>
        <strong>Open Live Watch</strong>
        <span>— {workspace.name}</span>
        <span className="offline-badge">OFFLINE SIMULATOR</span>
      </div>
      <nav>
        {["File", "Design", "View"].map((t) => (
          <button
            key={t}
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </nav>
      <div className="ribbon">
        {tab === "File" ? (
          <>
            <div className="group">
              <button onClick={() => void open()}>📂 Open</button>
              <button onClick={() => void save()}>▣ Save workspace</button>
            </div>
            <div className="group">
              <button
                onClick={() =>
                  download(
                    "sample,time_ms,speed_rpm\n" +
                      sim.history
                        .map((v, i) => `${i},${i * 50},${v}`)
                        .join("\n"),
                    "simulation.csv",
                    "text/csv",
                  )
                }
              >
                Export recent CSV
              </button>
              <button onClick={() => replace(initialWorkspace())}>
                Reset demo
              </button>
            </div>
          </>
        ) : tab === "View" ? (
          <>
            <div className="group">
              <button
                onClick={() => {
                  setLayout(defaults);
                  if (desktop)
                    void import("@tauri-apps/api/webviewWindow")
                      .then(async (m) => {
                        for (const p of Object.keys(defaults)) {
                          const w = await m.WebviewWindow.getByLabel(
                            "panel-" + p,
                          );
                          await w?.destroy();
                        }
                      })
                      .catch((error) =>
                        setError(
                          "Native layout restore failed: " + String(error),
                        ),
                      );
                }}
              >
                Restore default layout
              </button>
            </div>
            {Object.keys(defaults).map((p) => (
              <button
                key={p}
                onClick={() =>
                  setLayout((l) => ({ ...l, [p]: defaults[p as Panel] }))
                }
              >
                Show {p}
              </button>
            ))}
          </>
        ) : (
          <>
            <div className="group">
              <button
                className={sim.running ? "stop" : "run"}
                onClick={() =>
                  setSim((s) => ({
                    ...s,
                    running: !s.running,
                    epoch: s.epoch + 1,
                  }))
                }
              >
                {sim.running ? "■ Stop" : "▶ Run"}
              </button>
              <small>{sim.running ? "Simulation active" : "Design mode"}</small>
            </div>
            <div className="group">
              <button
                disabled={sim.running || !history.past.length}
                onClick={() => setHistory(undo)}
              >
                ↶ Undo
              </button>
              <button
                disabled={sim.running || !history.future.length}
                onClick={() => setHistory(redo)}
              >
                ↷ Redo
              </button>
            </div>
            <div className="group">
              <button
                disabled={sim.running || !selected.length}
                onClick={duplicate}
              >
                Duplicate
              </button>
              <button
                disabled={sim.running || !selected.length}
                onClick={remove}
              >
                Delete
              </button>
              <button
                disabled={sim.running || selected.length < 2}
                onClick={() => {
                  const w = structuredClone(workspace);
                  const x = Math.min(
                    ...w.screens[0].widgets
                      .filter((v) => selected.includes(v.id))
                      .map((v) => v.rect.x),
                  );
                  for (const v of w.screens[0].widgets)
                    if (selected.includes(v.id) && !locked.includes(v.id))
                      v.rect.x = x;
                  replace(w);
                }}
              >
                Align left
              </button>
            </div>
            <div className="group">
              <label>
                <input
                  type="checkbox"
                  checked={snap}
                  onChange={(e) => setSnap(e.target.checked)}
                />
                Snap grid
              </label>
              <select
                aria-label="Canvas zoom"
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
              >
                {[0.5, 1, 1.5, 2].map((z) => (
                  <option key={z} value={z}>
                    {z * 100}%
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>
      {error && (
        <div role="alert" className="error">
          {error}
          <button onClick={() => setError("")}>Dismiss</button>
        </div>
      )}
      <main>
        <aside
          className="left-dock"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            const p = e.dataTransfer.getData("panel");
            if (p in defaults) setLayout((l) => ({ ...l, [p]: "left" }));
          }}
        >
          {(Object.keys(defaults) as Panel[])
            .filter((p) => layout[p] === "left")
            .map(panelView)}
        </aside>
        <div className="document">
          <div className="document-tab">
            ▣ {screen.name}
            <span>
              {sim.running ? "Live simulated values" : "Design surface"}
            </span>
          </div>
          <div className="ruler horizontal">
            {Array.from({ length: 30 }, (_, i) => (
              <span key={i} style={{ width: 100 * zoom }}>
                {i * 100}
              </span>
            ))}
          </div>
          <div className="canvas-viewport" ref={viewport}>
            <div
              className="canvas-space"
              style={{
                width: screen.canvas.width * zoom,
                height: screen.canvas.height * zoom,
              }}
            >
              <div
                className="canvas"
                style={{
                  width: screen.canvas.width,
                  height: screen.canvas.height,
                  transform: `scale(${zoom})`,
                  backgroundSize: `${screen.canvas.grid}px ${screen.canvas.grid}px`,
                }}
                onPointerDown={() => setSelected([])}
              >
                {screen.widgets.map((w) => (
                  <div
                    key={w.id}
                    className={
                      "widget " + (selected.includes(w.id) ? "selected" : "")
                    }
                    style={{
                      left: w.rect.x,
                      top: w.rect.y,
                      width: w.rect.width,
                      height: w.rect.height,
                      transform: `rotate(${w.rect.rotation}deg)`,
                    }}
                    onPointerDown={(e) => pointerStart(e, w.id)}
                    onPointerMove={pointerMove}
                    onPointerUp={pointerEnd}
                    onLostPointerCapture={pointerEnd}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.stopPropagation();
                      const s = symbols.find(
                        (s) => s.path === e.dataTransfer.getData("symbol"),
                      );
                      if (
                        s &&
                        !sim.running &&
                        bindingCompatible(w.kind, s.path)
                      )
                        editWidget(w.id, {
                          binding: {
                            sourceId: "mock-motor",
                            symbolPath: s.path,
                            gain: 1,
                            offset: 0,
                            units: s.units,
                            periodMs: 50,
                            writable:
                              s.writable &&
                              ["slider", "switch", "button"].includes(w.kind),
                          },
                        });
                    }}
                  >
                    <Instrument
                      w={w}
                      value={
                        w.binding &&
                        workspace.sources.some(
                          (s) =>
                            s.id === w.binding!.sourceId &&
                            s.provider === "mock",
                        ) &&
                        w.binding.sourceId === "mock-motor" &&
                        bindingCompatible(w.kind, w.binding.symbolPath)
                          ? typeof sim.values[w.binding.symbolPath] === "number"
                            ? Number(sim.values[w.binding.symbolPath]) *
                                w.binding.gain +
                              w.binding.offset
                            : sim.values[w.binding.symbolPath]
                          : NaN
                      }
                      running={sim.running}
                      onWrite={(value) =>
                        command({
                          type: "write",
                          id: w.id,
                          value,
                          epoch: sim.epoch,
                        })
                      }
                    />
                    {selected.includes(w.id) &&
                      !sim.running &&
                      !locked.includes(w.id) && (
                        <>
                          {["nw", "n", "ne", "e", "se", "s", "sw", "w"].map(
                            (h) => (
                              <div
                                role="button"
                                aria-label={"Resize " + h}
                                key={h}
                                className={"handle " + h}
                                onPointerDown={(e) => pointerStart(e, w.id, h)}
                              />
                            ),
                          )}
                          <div
                            role="button"
                            aria-label="Rotate"
                            className="rotate-handle"
                            onPointerDown={(e) =>
                              pointerStart(e, w.id, "rotate")
                            }
                          >
                            ↻
                          </div>
                        </>
                      )}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="chart-strip">
            <span>Speed history • last 6 s</span>
            <svg viewBox="0 0 600 50" preserveAspectRatio="none">
              <polyline
                fill="none"
                stroke="#468623"
                strokeWidth="2"
                points={sim.history
                  .map((v, i) => `${(i * 600) / 119},${48 - (v / 3000) * 44}`)
                  .join(" ")}
              />
            </svg>
          </div>
        </div>
        <aside
          className="right-dock"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            const p = e.dataTransfer.getData("panel");
            if (p in defaults) setLayout((l) => ({ ...l, [p]: "right" }));
          }}
        >
          {(Object.keys(defaults) as Panel[])
            .filter((p) => layout[p] === "right")
            .map(panelView)}
        </aside>
        <div
          className="bottom-dock"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            const p = e.dataTransfer.getData("panel");
            if (p in defaults) setLayout((l) => ({ ...l, [p]: "bottom" }));
          }}
        >
          {(Object.keys(defaults) as Panel[])
            .filter((p) => layout[p] === "bottom")
            .map(panelView)}
        </div>
      </main>
      <footer>
        <span className={sim.running ? "quality" : "paused"}>
          ●{" "}
          {sim.running
            ? "Running • 20 Hz simulated acquisition"
            : "Stopped • edit freely"}
        </span>
        <span>
          {screen.widgets.length} instruments · {selected.length} selected ·
          session {sim.epoch}
        </span>
        <span>No embedded device connection</span>
      </footer>
      <input
        id="workspace-file"
        type="file"
        accept=".json"
        hidden
        onChange={async (e) => {
          try {
            const f = e.target.files?.[0];
            if (f) {
              replace(parseWorkspace(JSON.parse(await f.text())));
              setSelected([]);
            }
          } catch (e) {
            setError(String(e));
          }
          e.target.value = "";
        }}
      />
    </div>
  );
}
