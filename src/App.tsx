import { useEffect, useRef, useState } from "react";
import {
  initialWorkspace,
  createBlankWorkspace,
  workspaceFileName,
  createInstrument,
  hasMotorSimulator,
  isDocumentDirty,
  beginDocument,
  assertProjectEpoch,
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
import { Graph } from "./Graph";
import { BindingEditor } from "./BindingEditor";
import { SourceEditor } from "./SourceEditor";
import {
  catalogFor,
  compatibleSymbol,
  qualifiedKey,
  readBinding,
  newRuntime,
  applyBatch,
  validateMessage,
  messageBase,
  rawWidgetWrite,
  writeRuntime,
} from "./provider";
import { ColorControl } from "./ColorControl";
import {
  colorPresets,
  defaultInstrumentColor,
  resetInstrumentColors,
  DEFAULT_NEEDLE_COLOR,
} from "./colors";
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
  const [history, setHistory] = useState<History>(() => ({
    past: [],
    present: createBlankWorkspace(),
    future: [],
  }));
  const [saved, setSaved] = useState(() => JSON.stringify(history.present));
  const [filePath, setFilePath] = useState<string | null>(null);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [sourceEditorOpen, setSourceEditorOpen] = useState(false);
  const [projectName, setProjectName] = useState("My project");
  const [pendingReplacement, setPendingReplacement] = useState<{
    workspace: Workspace;
    path: string | null;
    label: string;
    unsaved: boolean;
  } | null>(null);
  const [saving, setSaving] = useState(false);
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
  const pendingWrite = useRef<{
    operationId: string;
    epoch: number;
    catalogRevision: number;
    commandRevision: number;
    sourceId: string;
    symbolPath: string;
    value: number | boolean;
  } | null>(null);
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
  const motorAvailable = hasMotorSimulator(workspace);
  const catalog = catalogFor(workspace.sources);
  const simulatorAvailable = catalog.length > 0;
  const sourceConfig = JSON.stringify(workspace.sources);
  const dirty = isDocumentDirty(workspace, saved);
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
    if (!w.screens[0].widgets.some((widget) => widget.id === id))
      throw new Error("Instrument belongs to a previous project");
    w.screens[0].widgets = w.screens[0].widgets.map((v) =>
      v.id === id ? { ...v, ...patch } : v,
    );
    replace(w);
  }
  function command(c: Command) {
    if (c.type === "patch" && c.epoch === undefined)
      c = { ...c, epoch: current.current.sim.epoch };
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
        if (pendingWrite.current)
          throw new Error("Previous write is awaiting a result");
        const state = current.current.sim;
        const raw = rawWidgetWrite(
          current.current.history.present,
          state,
          w,
          c.value,
          Number(c.epoch),
        );
        const operationId = crypto.randomUUID();
        pendingWrite.current = {
          operationId,
          epoch: state.epoch,
          catalogRevision: state.catalogRevision ?? 1,
          commandRevision: state.revision,
          ...raw,
        };
        worker.current?.postMessage({
          ...messageBase(state),
          kind: "write",
          commandRevision: state.revision,
          operationId,
          ...raw,
        });
        setTimeout(() => {
          if (pendingWrite.current?.operationId === operationId) {
            pendingWrite.current = null;
            setError(
              "Write outcome unknown: no result received. No automatic retry.",
            );
          }
        }, 2000);
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
        assertProjectEpoch(current.current.sim, c.epoch);
        if (pendingReplacement || newProjectOpen || sourceEditorOpen)
          throw new Error("Finish the project dialog before editing");
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
      if (!floating && m.kind === "command") {
        if (m.command?.type === "patch" && m.command.epoch === undefined) {
          setError("Editor command missing project session");
          return;
        }
        commandRef.current(m.command);
      }
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
    w.onerror = (event) => setError("Offline worker error: " + event.message);
    w.onmessage = (e) => {
      try {
        const m = validateMessage(e.data),
          state = current.current.sim,
          sources = current.current.history.present.sources;
        if (
          m.epoch !== state.epoch ||
          m.catalogRevision !== state.catalogRevision
        )
          return;
        if (m.kind === "sampleBatch") {
          const next = applyBatch(state, m, sources);
          current.current.sim = next;
          setSim(next);
        } else if (m.kind === "catalog") {
          if (JSON.stringify(m.symbols) !== JSON.stringify(catalogFor(sources)))
            throw new Error("Provider catalog mismatch");
        } else if (m.kind === "writeResult") {
          const pending = pendingWrite.current;
          if (
            !pending ||
            pending.operationId !== m.operationId ||
            pending.epoch !== m.epoch ||
            pending.catalogRevision !== m.catalogRevision
          )
            return;
          if (
            m.sourceId !== pending.sourceId ||
            m.symbolPath !== pending.symbolPath ||
            m.commandRevision !==
              pending.commandRevision + (m.status === "acknowledged" ? 1 : 0) ||
            (m.status === "acknowledged" && m.value !== pending.value)
          )
            throw new Error("Invalid write acknowledgment");
          pendingWrite.current = null;
          if (m.status !== "acknowledged")
            throw new Error("Write " + m.status + ": " + m.reason);
          const next = writeRuntime(
            state,
            sources,
            m.sourceId,
            m.symbolPath,
            m.value,
            m.epoch,
            m.catalogRevision,
          );
          current.current.sim = next;
          setSim(next);
        }
      } catch (error) {
        setError(String(error));
      }
    };
    w.postMessage({
      ...messageBase(current.current.sim),
      kind: "configure",
      commandRevision: current.current.sim.revision,
      running: current.current.sim.running,
      sources: current.current.history.present.sources,
    });
    return () => {
      w.terminate();
      worker.current = null;
    };
  }, []);
  useEffect(() => {
    if (!floating)
      worker.current?.postMessage({
        ...messageBase(sim),
        kind: "configure",
        commandRevision: sim.revision,
        running: sim.running,
        sources: workspace.sources,
      });
  }, [sim.epoch, sim.revision, sim.running]);
  useEffect(() => {
    if (floating) return;
    const state = current.current.sim;
    const next = newRuntime(
      current.current.history.present.sources,
      state.epoch + 1,
      (state.catalogRevision ?? 0) + 1,
      false,
    );
    pendingWrite.current = null;
    current.current.sim = next;
    setSim(next);
  }, [sourceConfig]);
  useEffect(() => {
    if (!floating)
      localStorage.setItem(
        "olw-layout",
        JSON.stringify({ version: 1, panels: layout }),
      );
  }, [layout]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (pendingReplacement || newProjectOpen || sourceEditorOpen) {
        if (e.key === "Escape" && !saving) {
          setPendingReplacement(null);
          setNewProjectOpen(false);
          setSourceEditorOpen(false);
        }
        return;
      }
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
  }, [
    selected,
    sim.running,
    locked,
    pendingReplacement,
    sourceEditorOpen,
    newProjectOpen,
    saving,
  ]);
  function add(kind: Kind) {
    const w = structuredClone(workspace);
    const id = crypto.randomUUID();
    w.screens[0].widgets.push(
      createInstrument(kind, id, screen.widgets.length),
    );
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
  function applyReplacement(next: NonNullable<typeof pendingReplacement>) {
    const project = beginDocument(
      next.workspace,
      current.current.sim,
      next.path,
      next.unsaved,
    );
    gesture.current = null;
    current.current = {
      ...current.current,
      history: project.history,
      sim: project.sim,
      selected: [],
    };
    setHistory(project.history);
    setSim(project.sim);
    setSaved(project.saved);
    setFilePath(project.filePath);
    setSelected([]);
    setLocked([]);
    setQuery("");
    setZoom(1);
    setPendingReplacement(null);
    setError("");
    viewport.current?.scrollTo(0, 0);
  }
  function requestReplacement(next: NonNullable<typeof pendingReplacement>) {
    next = { ...next, workspace: parseWorkspace(next.workspace) };
    if (isDocumentDirty(current.current.history.present, saved))
      setPendingReplacement(next);
    else applyReplacement(next);
  }
  async function save(saveAs = false): Promise<boolean> {
    setSaving(true);
    try {
      const snapshot = parseWorkspace(current.current.history.present);
      const data = JSON.stringify(snapshot, null, 2);
      if (desktop) {
        const { save } = await import("@tauri-apps/plugin-dialog");
        const path =
          !saveAs && filePath
            ? filePath
            : await save({
                defaultPath: filePath ?? workspaceFileName(snapshot.name),
                filters: [{ name: "Open Live Watch", extensions: ["json"] }],
              });
        if (!path) return false;
        {
          const { invoke } = await import("@tauri-apps/api/core");
          await invoke("save_workspace", { path, data });
          setFilePath(path);
        }
      } else download(data, snapshot.name + ".olw.json", "application/json");
      setSaved(JSON.stringify(snapshot));
      return true;
    } catch (e) {
      setError(String(e));
      return false;
    } finally {
      setSaving(false);
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
          requestReplacement({
            workspace: parseWorkspace(
              JSON.parse(await invoke<string>("load_workspace", { path })),
            ),
            path,
            label: "open another project",
            unsaved: false,
          });
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
  function trapModalFocus(e: React.KeyboardEvent) {
    if (e.key !== "Tab") return;
    const dialog = e.currentTarget;
    const controls = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        "button:not(:disabled),input:not(:disabled)",
      ),
    );
    const first = controls[0],
      last = controls.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  }
  useEffect(() => {
    if (newProjectOpen || pendingReplacement)
      document
        .querySelector<HTMLElement>(
          '[role="dialog"] input,[role="dialog"] button',
        )
        ?.focus();
  }, [newProjectOpen, pendingReplacement]);
  function content(panel: Panel) {
    if (panel === "explorer")
      return (
        <div className="tree">
          <strong>▾ {workspace.name}</strong>
          <div>▾ Screens</div>
          <div className="tree-selected">▣ {screen.name}</div>
          <div>▾ Sources</div>
          <div>
            {simulatorAvailable
              ? workspace.sources
                  .filter(
                    (s) =>
                      s.provider === "offline" ||
                      (s.id === "mock-motor" && s.provider === "mock"),
                  )
                  .map((s) => s.id + " • " + s.provider)
                  .join(", ")
              : workspace.sources.length
                ? "Unsupported source • no runtime backend"
                : "None • layout design only"}
          </div>
          <p>
            Click a toolbox instrument to add it. Shift-click selects multiple
            objects.
          </p>
          {!floating && (
            <button
              disabled={sim.running}
              onClick={() => setSourceEditorOpen(true)}
            >
              Configure data sources
            </button>
          )}
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
              "graph",
            ] as Kind[]
          ).map((k) => (
            <button
              key={k}
              disabled={sim.running || !!floating}
              onClick={() => add(k)}
            >
              {k === "graph" ? (
                <Graph
                  w={createInstrument(k, "toolbox-graph")}
                  sim={sim}
                  workspace={workspace}
                  thumbnail
                />
              ) : (
                <Instrument
                  w={createInstrument(k, "toolbox-" + k)}
                  value={NaN}
                  running={false}
                  thumbnail
                  onWrite={() => {}}
                />
              )}
              {k}
            </button>
          ))}
        </div>
      );
    if (panel === "symbols" && !simulatorAvailable)
      return (
        <div className="no-source">
          <strong>
            {workspace.sources.length
              ? "Unsupported data source"
              : "No data source configured"}
          </strong>
          <p>
            {workspace.sources.length
              ? "The configured sources are not supported by this offline simulator."
              : "This project has no device or simulator bindings."}{" "}
            Arrange instruments using Design previews.
          </p>
          <p>Configure offline sources to create your own signals.</p>
          {!floating && (
            <button
              disabled={sim.running}
              onClick={() => setSourceEditorOpen(true)}
            >
              Configure data sources
            </button>
          )}
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
              {catalog
                .filter((s) =>
                  (s.sourceId + "/" + s.symbolPath).includes(query),
                )
                .map((s) => (
                  <tr
                    key={qualifiedKey(s.sourceId, s.symbolPath)}
                    draggable={!floating}
                    onDragStart={(e) =>
                      e.dataTransfer.setData(
                        "symbol",
                        qualifiedKey(s.sourceId, s.symbolPath),
                      )
                    }
                  >
                    <td>
                      {s.sourceId} / {s.symbolPath}
                    </td>
                    <td>{s.type}</td>
                    <td>
                      {typeof sim.values[
                        qualifiedKey(s.sourceId, s.symbolPath)
                      ] === "boolean"
                        ? String(
                            sim.values[qualifiedKey(s.sourceId, s.symbolPath)],
                          )
                        : Number(
                            sim.values[qualifiedKey(s.sourceId, s.symbolPath)],
                          ).toFixed(1)}{" "}
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
        <fieldset className="appearance" disabled={sim.running}>
          <legend>Appearance</legend>
          <label>
            Preset
            <select
              aria-label="Instrument color preset"
              value={
                colorPresets.some(
                  (p) =>
                    p.color.toLowerCase() ===
                    (
                      chosen.settings.color ??
                      defaultInstrumentColor(chosen.kind)
                    ).toLowerCase(),
                )
                  ? (
                      chosen.settings.color ??
                      defaultInstrumentColor(chosen.kind)
                    ).toLowerCase()
                  : "custom"
              }
              onChange={(e) => {
                if (e.target.value !== "custom")
                  command({
                    type: "patch",
                    id: chosen.id,
                    patch: {
                      settings: { ...chosen.settings, color: e.target.value },
                    },
                  });
              }}
            >
              {colorPresets.map((p) => (
                <option key={p.color} value={p.color}>
                  {p.name}
                </option>
              ))}
              <option value="custom">Custom</option>
            </select>
          </label>
          <label>
            Accent
            <ColorControl
              key={chosen.id + "-accent"}
              label="Instrument accent"
              value={
                chosen.settings.color ?? defaultInstrumentColor(chosen.kind)
              }
              onCommit={(color) =>
                command({
                  type: "patch",
                  id: chosen.id,
                  patch: {
                    settings: { ...chosen.settings, color },
                  },
                })
              }
            />
          </label>
          {chosen.kind === "radial" && (
            <label>
              Needle
              <ColorControl
                key={chosen.id + "-needle"}
                label="Gauge needle"
                value={chosen.settings.needleColor ?? DEFAULT_NEEDLE_COLOR}
                onCommit={(needleColor) =>
                  command({
                    type: "patch",
                    id: chosen.id,
                    patch: {
                      settings: {
                        ...chosen.settings,
                        needleColor,
                      },
                    },
                  })
                }
              />
            </label>
          )}
          <button
            onClick={() => {
              const settings = resetInstrumentColors(chosen.settings);
              command({ type: "patch", id: chosen.id, patch: { settings } });
            }}
          >
            Restore default colors
          </button>
          <p>
            Defaults follow the instrument type; custom colors are saved per
            instrument. Value contrast is automatic.
          </p>
        </fieldset>
        <BindingEditor
          binding={chosen.binding}
          sources={workspace.sources}
          kind={chosen.kind}
          disabled={sim.running}
          onChange={(binding) =>
            command({ type: "patch", id: chosen.id, patch: { binding } })
          }
        />
        <fieldset disabled={sim.running}>
          <legend>Display scale</legend>
          {(["min", "max", "precision"] as const).map((key) => (
            <label key={key}>
              {key}
              <input
                type="number"
                value={chosen.settings[key] ?? (key === "max" ? 100 : 0)}
                min={key === "precision" ? 0 : undefined}
                max={key === "precision" ? 12 : undefined}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  if (Number.isFinite(value))
                    command({
                      type: "patch",
                      id: chosen.id,
                      patch: { settings: { ...chosen.settings, [key]: value } },
                    });
                }}
              />
            </label>
          ))}
        </fieldset>
        {chosen.kind === "graph" && (
          <fieldset disabled={sim.running}>
            <legend>2D graph</legend>
            <label>
              Mode
              <select
                aria-label="Graph mode"
                value={chosen.settings.graph?.mode ?? "time"}
                onChange={(e) => {
                  const mode = e.target.value as "time" | "xy",
                    x = catalog.find((c) => c.type === "number");
                  if (mode === "xy" && !x) {
                    setError("Configure a numeric X variable first");
                    return;
                  }
                  command({
                    type: "patch",
                    id: chosen.id,
                    patch: {
                      settings: {
                        ...chosen.settings,
                        graph: {
                          capacity: 200,
                          windowMs: 10000,
                          ...chosen.settings.graph,
                          mode,
                          ...(mode === "xy" && !chosen.settings.graph?.x && x
                            ? {
                                x: {
                                  sourceId: x.sourceId,
                                  symbolPath: x.symbolPath,
                                  gain: 1,
                                  offset: 0,
                                  units: x.units,
                                  periodMs: 50,
                                  writable: false,
                                },
                              }
                            : {}),
                        },
                      },
                    },
                  });
                }}
              >
                <option value="time">Time series</option>
                <option value="xy">XY coherent pairs</option>
              </select>
            </label>
            {chosen.settings.graph?.mode === "xy" && (
              <BindingEditor
                label="Graph X"
                kind="graph"
                sources={workspace.sources}
                binding={chosen.settings.graph.x}
                disabled={sim.running}
                onChange={(x) => {
                  if (x)
                    command({
                      type: "patch",
                      id: chosen.id,
                      patch: {
                        settings: {
                          ...chosen.settings,
                          graph: { ...chosen.settings.graph!, x },
                        },
                      },
                    });
                }}
              />
            )}
            {(["capacity", "windowMs"] as const).map((key) => (
              <label key={key}>
                {key === "capacity" ? "Maximum points" : "Visible history (ms)"}
                <input
                  type="number"
                  value={
                    chosen.settings.graph?.[key] ??
                    (key === "capacity" ? 200 : 10000)
                  }
                  onChange={(e) =>
                    command({
                      type: "patch",
                      id: chosen.id,
                      patch: {
                        settings: {
                          ...chosen.settings,
                          graph: {
                            mode: "time",
                            capacity: 200,
                            windowMs: 10000,
                            ...chosen.settings.graph,
                            [key]: Number(e.target.value),
                          },
                        },
                      },
                    })
                  }
                />
              </label>
            ))}
            <label>
              <input
                type="checkbox"
                checked={chosen.settings.graph?.autoY !== false}
                onChange={(e) =>
                  command({
                    type: "patch",
                    id: chosen.id,
                    patch: {
                      settings: {
                        ...chosen.settings,
                        graph: {
                          mode: "time",
                          capacity: 200,
                          windowMs: 10000,
                          ...chosen.settings.graph,
                          autoY: e.target.checked,
                        },
                      },
                    },
                  })
                }
              />
              Automatic Y axis
            </label>
            <p>
              X axes auto-scale; manual Y uses Display scale limits. History is
              bounded to 600 coherent simulation frames.
            </p>
          </fieldset>
        )}
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
        <span>
          — {workspace.name}
          {dirty ? " • unsaved" : ""}
        </span>
        <span className="offline-badge">
          {simulatorAvailable ? "OFFLINE SIMULATOR" : "PROJECT DESIGNER"}
        </span>
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
              <button
                onClick={() => {
                  setProjectName("My project");
                  setNewProjectOpen(true);
                }}
              >
                New project
              </button>
              <button onClick={() => void open()}>Open project</button>
              <button disabled={saving} onClick={() => void save()}>
                Save project
              </button>
              <button disabled={saving} onClick={() => void save(true)}>
                Save as…
              </button>
            </div>
            <div className="group">
              <button
                disabled={!simulatorAvailable}
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
              <button
                onClick={() =>
                  requestReplacement({
                    workspace: initialWorkspace(),
                    path: null,
                    label: "open the motor demo",
                    unsaved: false,
                  })
                }
              >
                Open motor demo
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
                disabled={sim.running}
                onClick={() => setSourceEditorOpen(true)}
              >
                Configure data sources
              </button>
              <button
                className={sim.running ? "stop" : "run"}
                disabled={!simulatorAvailable}
                title={
                  simulatorAvailable
                    ? "Run configured offline sources"
                    : "Configure an offline source to simulate readings."
                }
                onClick={() => {
                  const state = current.current.sim;
                  pendingWrite.current = null;
                  const next = state.running
                    ? { ...state, running: false, epoch: state.epoch + 1 }
                    : newRuntime(
                        workspace.sources,
                        state.epoch + 1,
                        state.catalogRevision ?? 1,
                        true,
                      );
                  current.current.sim = next;
                  setSim(next);
                }}
              >
                {sim.running ? "■ Stop" : "▶ Run"}
              </button>
              <small>
                {sim.running
                  ? "Simulation active"
                  : simulatorAvailable
                    ? "Design mode"
                    : "No source configured"}
              </small>
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
                {!screen.widgets.length && (
                  <div className="empty-canvas">
                    <svg
                      width="68"
                      height="60"
                      viewBox="0 0 68 60"
                      aria-hidden="true"
                    >
                      <rect
                        x="4"
                        y="4"
                        width="60"
                        height="50"
                        rx="4"
                        fill="#f7fafc"
                        stroke="#8da9b9"
                      />
                      <path
                        d="M14 40L24 25L36 32L51 16M14 46H54"
                        fill="none"
                        stroke="#719aac"
                        strokeWidth="2"
                      />
                    </svg>
                    <h2>Build your instrument screen</h2>
                    <p>
                      Choose a control in the Toolbox, then drag, resize and
                      customize it.
                    </p>
                    <p>
                      Unbound instruments show clearly marked Design previews.
                    </p>
                    <div>
                      <button
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => {
                          setProjectName("My project");
                          setNewProjectOpen(true);
                        }}
                      >
                        New project…
                      </button>
                      <button
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() =>
                          requestReplacement({
                            workspace: initialWorkspace(),
                            path: null,
                            label: "open the motor demo",
                            unsaved: false,
                          })
                        }
                      >
                        Open motor demo
                      </button>
                    </div>
                  </div>
                )}
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
                      const s = catalog.find(
                        (s) =>
                          qualifiedKey(s.sourceId, s.symbolPath) ===
                          e.dataTransfer.getData("symbol"),
                      );
                      if (s && !sim.running && compatibleSymbol(w.kind, s))
                        editWidget(w.id, {
                          binding: {
                            sourceId: s.sourceId,
                            symbolPath: s.symbolPath,
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
                    {w.kind === "graph" ? (
                      <Graph w={w} sim={sim} workspace={workspace} />
                    ) : (
                      <Instrument
                        w={w}
                        value={readBinding(workspace, sim, w)}
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
                    )}
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
          {motorAvailable && (
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
          )}
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
            : simulatorAvailable
              ? "Stopped • edit freely"
              : "Design • no data source"}
        </span>
        <span>
          {screen.widgets.length} instruments · {selected.length} selected ·
          session {sim.epoch}
        </span>
        <span>No embedded device connection</span>
        <span title={filePath ?? "No file associated"}>
          {filePath ? filePath.split(/[\\/]/).at(-1) : "Unsaved file"}
        </span>
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
              requestReplacement({
                workspace: parseWorkspace(JSON.parse(await f.text())),
                path: null,
                label: "open another project",
                unsaved: false,
              });
            }
          } catch (e) {
            setError(String(e));
          }
          e.target.value = "";
        }}
      />
      {sourceEditorOpen && (
        <SourceEditor
          sources={workspace.sources}
          onCancel={() => setSourceEditorOpen(false)}
          onApply={(sources) => {
            if (current.current.sim.running)
              throw new Error("Stop before configuring sources");
            const next = { ...current.current.history.present, sources };
            replace(next);
            setSourceEditorOpen(false);
          }}
        />
      )}
      {newProjectOpen && (
        <div className="modal-backdrop">
          <form
            className="project-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="New project"
            onKeyDown={trapModalFocus}
            onSubmit={(e) => {
              e.preventDefault();
              try {
                const blank = createBlankWorkspace(projectName);
                setNewProjectOpen(false);
                requestReplacement({
                  workspace: blank,
                  path: null,
                  label: "create a new project",
                  unsaved: true,
                });
              } catch (error) {
                setError(String(error));
              }
            }}
          >
            <h2>New project</h2>
            <p>Start with a blank screen and no data source.</p>
            <label>
              Project name
              <input
                value={projectName}
                maxLength={120}
                onChange={(e) => setProjectName(e.target.value)}
                autoFocus
              />
            </label>
            <p className="dialog-note">
              Arrange instruments now. Embedded-device interfaces are planned
              for a later milestone.
            </p>
            <div className="dialog-actions">
              <button type="button" onClick={() => setNewProjectOpen(false)}>
                Cancel
              </button>
              <button type="submit" disabled={!projectName.trim()}>
                Create project
              </button>
            </div>
          </form>
        </div>
      )}
      {pendingReplacement && (
        <div className="modal-backdrop">
          <div
            className="project-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Unsaved project"
            onKeyDown={trapModalFocus}
          >
            <h2>Save changes to {workspace.name}?</h2>
            <p>
              Your instrument layout has unsaved changes. Save or discard them
              to {pendingReplacement.label}.
            </p>
            {error && (
              <p role="alert" className="dialog-error">
                {error}
              </p>
            )}
            <div className="dialog-actions">
              <button
                disabled={saving}
                onClick={() => setPendingReplacement(null)}
              >
                Cancel
              </button>
              <button
                disabled={saving}
                onClick={() => applyReplacement(pendingReplacement)}
              >
                Discard changes
              </button>
              <button
                disabled={saving}
                onClick={async () => {
                  const next = pendingReplacement;
                  if (await save()) applyReplacement(next);
                }}
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
