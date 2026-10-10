import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
import { DockHost } from "./DockHost";
import { ScreenView } from "./ScreenView";
import {
  defaultDockLayout,
  migrateDockLayout,
  parseDockLayout,
  parseStoredDockLayout,
  placePanel,
  setPanelLocation,
  dockPanelLocations,
  dockNodes,
  detachPanel,
  restoreNativeBounds,
  captureNativeBounds,
  logicalDecoration,
  type WindowBounds,
  type DockLayout,
  type DockEdge,
} from "./docking";
import {
  Diagnostics,
  boundedMetric,
  type PerformanceMetrics,
} from "./Diagnostics";
import { GraphSeriesEditor } from "./GraphSeriesEditor";
import { HoldGate } from "./HoldGate";
import { Recorder, batchLogFrame, historyCsv } from "./recording";
import { parseRecovery, recoveryInvoke, type RecoveryRead } from "./recovery";
import {
  editorCommand,
  movableSelection,
  transformSelection,
  resizeSelectionByFactor,
  expandGroups,
  vacantPosition,
  overlapIds,
  pasteWidgets,
  marqueeSelection,
  type EditorAction,
} from "./editor";
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
type Panel =
  | "explorer"
  | "toolbox"
  | "symbols"
  | "properties"
  | `screen:${string}`;
type Edge = "left" | "right" | "bottom" | "top" | "hidden" | "floating";
type Layout = Record<string, Edge>;
type Snapshot = {
  workspace: Workspace;
  sim: Sim;
  selected: string[];
  activeScreenId: string;
  layout: Layout;
  dockLayout: DockLayout;
};
const defaults: Record<string, Edge> = {
  explorer: "left",
  toolbox: "left",
  properties: "right",
  symbols: "bottom",
};
function nativeLabel(panel: string) {
  return panel.startsWith("screen:")
    ? "panel-screen-" +
        [...new TextEncoder().encode(panel)]
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("")
    : "panel-" + panel;
}
let publish: (message: unknown) => void = () => {};
type Command = { type: string; [key: string]: unknown };
export function App() {
  const floating = useRef(
    new URLSearchParams(location.search).get("panel") as Panel | null,
  ).current;
  const desktop = "__TAURI_INTERNALS__" in window;
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
  const [recordingStatus, setRecordingStatus] = useState("Not recording");
  const [recordingActive, setRecordingActive] = useState(false);
  const recorder = useRef<{
    recorder: Recorder;
    epoch: number;
    catalogRevision: number;
  } | null>(null);
  const recordingStop = useRef<Promise<void> | null>(null);
  const recordingStarting = useRef(false);
  const recordingStartTask = useRef<Promise<void> | null>(null);
  const recordingGeneration = useRef(0);
  const recordingCleanupFailure = useRef<Error | null>(null);
  const [recordingBusy, setRecordingBusy] = useState(false);
  const transitionBusy = useRef(false);
  const [transitionVisible, setTransitionVisible] = useState(false);
  async function deadline<T>(task: Promise<T>, label: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        task,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(new Error(label + " outcome unknown; no automatic retry")),
            5000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  async function stopRecording() {
    if (recordingStop.current) return recordingStop.current;
    recordingGeneration.current++;
    if (recordingStartTask.current)
      await deadline(recordingStartTask.current, "Recording start cleanup");
    if (recordingCleanupFailure.current) throw recordingCleanupFailure.current;
    const active = recorder.current;
    if (!active) return;
    recorder.current = null;
    setRecordingActive(false);
    setRecordingStatus("Flushing recording…");
    const task = active.recorder.stop().finally(() => {
      recordingStop.current = null;
    });
    recordingStop.current = task;
    return task;
  }
  async function startRecording() {
    if (
      !desktop ||
      recordingStarting.current ||
      recorder.current ||
      recordingStop.current
    )
      return;
    recordingStarting.current = true;
    setRecordingBusy(true);
    const generation = recordingGeneration.current;
    const task = (async () => {
      try {
        const state = current.current.sim,
          doc = current.current.history.present;
        if (!state.running) throw new Error("Start Run before recording");
        const { save } = await import("@tauri-apps/plugin-dialog");
        const path = await save({
          defaultPath: "recording.csv",
          filters: [{ name: "CSV recording", extensions: ["csv"] }],
        });
        if (!path || generation !== recordingGeneration.current) return;
        const { invoke } = await import("@tauri-apps/api/core");
        const starting = invoke<number>("start_recording", {
          path,
          epoch: state.epoch,
          catalogRevision: state.catalogRevision ?? 1,
          workspace: JSON.stringify(doc),
        });
        let id: number;
        try {
          id = await deadline(starting, "Recording start");
        } catch (error) {
          recordingGeneration.current++;
          void starting
            .then(async (lateId) => {
              await invoke("finish_recording", { id: lateId });
              recordingCleanupFailure.current = null;
              setRecordingStatus(
                "Late recording start closed; no samples admitted",
              );
            })
            .catch((cleanupError) =>
              setRecordingStatus(
                "Late recording cleanup failed: " + String(cleanupError),
              ),
            );
          throw error;
        }
        const now = current.current.sim;
        if (
          generation !== recordingGeneration.current ||
          !now.running ||
          now.epoch !== state.epoch ||
          now.catalogRevision !== state.catalogRevision
        ) {
          await deadline(
            invoke<void>("finish_recording", { id }),
            "Recording canceled-start flush",
          );
          setRecordingStatus(
            "Recording canceled because the session changed; empty file preserved",
          );
          return;
        }
        const r = new Recorder(
          {
            append: (frames) =>
              invoke("append_recording", {
                id,
                epoch: state.epoch,
                catalogRevision: state.catalogRevision ?? 1,
                frames: JSON.stringify(frames),
              }),
            finish: () => invoke("finish_recording", { id }),
          },
          setRecordingStatus,
          catalogFor(doc.sources),
          state.epoch,
          state.catalogRevision ?? 1,
        );
        recorder.current = {
          recorder: r,
          epoch: state.epoch,
          catalogRevision: state.catalogRevision ?? 1,
        };
        setRecordingActive(true);
        setRecordingStatus("Recording all variables • " + path);
      } catch (error) {
        if (generation !== recordingGeneration.current)
          recordingCleanupFailure.current =
            error instanceof Error ? error : new Error(String(error));
        setRecordingStatus("Recording failed: " + String(error));
        setError(String(error));
      } finally {
        recordingStarting.current = false;
        setRecordingBusy(false);
      }
    })();
    recordingStartTask.current = task;
    try {
      await task;
    } finally {
      if (recordingStartTask.current === task)
        recordingStartTask.current = null;
    }
  }
  const [closePending, setClosePending] = useState(false);
  const [recoveryChoice, setRecoveryChoice] = useState<RecoveryRead | null>(
    null,
  );
  const [recoveryVersion, setRecoveryVersion] = useState(0);
  const [recoveryLoaded, setRecoveryLoaded] = useState(false);
  const recoveryGeneration = useRef<number | null>(null),
    recoveryRevision = useRef(0),
    recoveryChain = useRef(Promise.resolve());
  const closeRequest = useRef<() => void>(() => {});
  function advanceRecovery(clear = false, replaceExisting = false) {
    const old = recoveryGeneration.current;
    let cleared = false;
    recoveryGeneration.current = null;
    const task = recoveryChain.current
      .catch(() => {})
      .then(async () => {
        if (clear && old !== null) {
          await recoveryInvoke("recovery_clear", { generation: old });
          cleared = true;
        }
        const generation = await recoveryInvoke<number>("recovery_begin", {
          replaceExisting,
        });
        recoveryGeneration.current = generation;
        setRecoveryVersion((v) => v + 1);
      });
    recoveryChain.current = task.catch(() => {});
    return task.catch(async (e) => {
      if (recoveryGeneration.current === null) {
        if (!cleared) recoveryGeneration.current = old;
        else {
          try {
            const status = await recoveryInvoke<RecoveryRead>("recovery_read");
            recoveryGeneration.current = status.generation ?? old;
          } catch {
            recoveryGeneration.current = old;
          }
        }
      }
      setError("Recovery: " + String(e));
      throw e;
    });
  }

  const [sim, setSim] = useState(initialSim);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const performanceMetrics = useRef<PerformanceMetrics>({
    processingMs: [],
    commitMs: [],
    receivedAt: 0,
    lastTick: -1,
  });
  useLayoutEffect(() => {
    const m = performanceMetrics.current;
    if (m.lastTick === sim.tick && m.receivedAt) {
      boundedMetric(m.commitMs, performance.now() - m.receivedAt);
      m.receivedAt = 0;
    }
  }, [sim.tick]);
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
  const deferredLayout = useRef<{
    workspaceId: string;
    layout: DockLayout;
  } | null>(null);
  const [dockLayout, setDockLayout] = useState<DockLayout>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem("olw-layout") ?? "null");
      if (raw?.version === 2) {
        const valid = parseStoredDockLayout(raw);
        const screens = Object.keys(dockPanelLocations(valid)).filter((p) =>
          p.startsWith("screen:"),
        );
        if (screens.length) {
          deferredLayout.current = {
            workspaceId: localStorage.getItem("olw-layout-workspace") ?? "",
            layout: valid,
          };
          let base = valid;
          for (const panel of screens) base = detachPanel(base, panel);
          return parseDockLayout(base);
        }
        return valid;
      }
      return migrateDockLayout(raw);
    } catch {
      return defaultDockLayout();
    }
  });
  function updateDockLayout(next: DockLayout) {
    try {
      next = parseDockLayout(next, [
        ...Object.keys(defaults),
        ...current.current.history.present.screens.map((s) => "screen:" + s.id),
      ]);
      deferredLayout.current = null;
      setDockLayout(next);
      setLayout(dockPanelLocations(next) as Layout);
      current.current.dockLayout = next;
      current.current.layout = dockPanelLocations(next) as Layout;
    } catch (error) {
      setError("Dock layout unchanged: " + String(error));
    }
  }

  function dockPanel(panel: Panel, edge: Edge, autoHide = false) {
    const now = current.current.dockLayout;
    updateDockLayout(
      edge === "hidden" || edge === "floating"
        ? setPanelLocation(now, panel, edge)
        : autoHide
          ? setPanelLocation(now, panel, edge)
          : placePanel(
              now,
              panel,
              dockNodes(now.root).find((n) => n.type === "canvas")!.id,
              edge,
            ),
    );
  }
  const [layoutName, setLayoutName] = useState("My layout");
  const [namedLayouts, setNamedLayouts] = useState<
    { name: string; layout: DockLayout }[]
  >(() => {
    try {
      const list = JSON.parse(
        localStorage.getItem("olw-named-layouts") ?? "[]",
      );
      return Array.isArray(list) && list.length <= 8
        ? list
            .filter(
              (item) => typeof item.name === "string" && item.name.length <= 64,
            )
            .map((item) => ({
              name: item.name,
              layout: parseStoredDockLayout(item.layout),
            }))
        : [];
    } catch {
      return [];
    }
  });
  function saveNamedLayout() {
    try {
      const name = layoutName.trim();
      if (!name || name.length > 64)
        throw new Error("Layout name requires 1–64 characters");
      if (
        namedLayouts.length >= 8 &&
        !namedLayouts.some((n) => n.name === name)
      )
        throw new Error("At most 8 named layouts");
      const next = [
        ...namedLayouts.filter((n) => n.name !== name),
        { name, layout: structuredClone(current.current.dockLayout) },
      ];
      localStorage.setItem("olw-named-layouts", JSON.stringify(next));
      setNamedLayouts(next);
    } catch (error) {
      setError(String(error));
    }
  }
  async function loadNamedLayout(name: string) {
    try {
      const item = namedLayouts.find((n) => n.name === name);
      if (!item) return;
      const old = current.current.dockLayout.floating.map((f) => f.panel);
      const next = parseDockLayout(item.layout, [
        ...Object.keys(defaults),
        ...current.current.history.present.screens.map((s) => "screen:" + s.id),
      ]);
      if (desktop) {
        const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
        for (const panel of old) {
          const win = await WebviewWindow.getByLabel(nativeLabel(panel));
          await win?.destroy();
        }
      }
      updateDockLayout(next);
    } catch (error) {
      setError("Layout restore failed: " + String(error));
    }
  }
  const [tab, setTab] = useState("Design");
  const [zoom, setZoom] = useState(1);
  const [snap, setSnap] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [activeScreenId, setActiveScreenId] = useState(
    history.present.screens[0].id,
  );
  const clipboard = useRef<Widget[]>([]);
  const [marquee, setMarquee] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const marqueeStart = useRef<{
    x: number;
    y: number;
    ids: string[];
    previous: string[];
  } | null>(null);
  const current = useRef({
    history,
    sim,
    selected,
    layout,
    dockLayout,
    activeScreenId,
  });
  current.current = {
    history,
    sim,
    selected,
    layout,
    dockLayout,
    activeScreenId,
  };
  const worker = useRef<Worker | null>(null);
  const operationCounter = useRef({ epoch: -1, counter: 0 });
  const releaseWrite = useRef<Command | null>(null);
  const heldWrite = useRef(new HoldGate());
  const pendingWrite = useRef<{
    operationId: string;
    id: string;
    screenId: string;
    finalRelease: boolean;
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
    screen =
      workspace.screens.find(
        (s) =>
          s.id ===
          (floating?.startsWith("screen:")
            ? floating.slice(7)
            : activeScreenId),
      ) ?? workspace.screens[0],
    locked = screen.widgets.filter((w) => w.locked).map((w) => w.id),
    chosen = screen.widgets.find((w) => w.id === selected[0]);
  const motorAvailable = hasMotorSimulator(workspace);
  const catalog = catalogFor(workspace.sources);
  const simulatorAvailable = catalog.length > 0;
  const sourceConfig = JSON.stringify(workspace.sources);
  const dirty = isDocumentDirty(workspace, saved);
  useEffect(() => {
    if (!workspace.screens.some((s) => s.id === activeScreenId)) {
      const id = workspace.screens[0].id;
      setActiveScreenId(id);
      current.current.activeScreenId = id;
      setSelected([]);
    }
  }, [workspace.screens, activeScreenId]);
  useEffect(() => {
    if (floating) return;
    let alive = true;
    void recoveryInvoke<RecoveryRead>("recovery_read")
      .then((result) => {
        if (!alive) return;
        if (result.status === "valid") {
          try {
            result = {
              status: "valid",
              snapshot: parseRecovery(result.snapshot),
              generation: result.generation,
            };
          } catch (e) {
            result = {
              status: "corrupt",
              reason: String(e),
              generation: result.generation,
            };
          }
        }
        if (result.status === "missing") void advanceRecovery().catch(() => {});
        else {
          recoveryGeneration.current = result.generation ?? 0;
          setRecoveryChoice(result);
        }
      })
      .catch((e) => setError("Recovery unavailable: " + String(e)))
      .finally(() => {
        if (alive) setRecoveryLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (
      floating ||
      !dirty ||
      recoveryChoice ||
      recoveryGeneration.current === null
    )
      return;
    const generation = recoveryGeneration.current;
    const timeout = setTimeout(() => {
      const revision = ++recoveryRevision.current;
      void recoveryInvoke("recovery_write", {
        generation,
        revision,
        savedPath: filePath,
        data: JSON.stringify(workspace),
      }).catch((e) => {
        if (recoveryGeneration.current === generation)
          setError("Recovery snapshot failed: " + String(e));
      });
    }, 500);
    return () => clearTimeout(timeout);
  }, [workspace, dirty, filePath, recoveryChoice, recoveryVersion]);
  closeRequest.current = () => {
    if (
      pendingReplacement ||
      newProjectOpen ||
      sourceEditorOpen ||
      recoveryChoice
    ) {
      setError("Finish the current project dialog before closing");
      return;
    }
    if (isDocumentDirty(current.current.history.present, saved))
      setClosePending(true);
    else void finishClose(false);
  };
  useEffect(() => {
    if (floating) return;
    const before = (e: BeforeUnloadEvent) => {
      if (isDocumentDirty(current.current.history.present, saved)) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [saved]);
  useEffect(() => {
    if (floating || !desktop) return;
    let alive = true,
      off = () => {};
    void import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
      const unlisten = await getCurrentWindow().onCloseRequested((e) => {
        e.preventDefault();
        closeRequest.current();
      });
      if (alive) off = unlisten;
      else unlisten();
    });
    return () => {
      alive = false;
      off();
    };
  }, []);
  async function finishClose(discard: boolean) {
    if (transitionBusy.current) return;
    transitionBusy.current = true;
    setTransitionVisible(true);
    try {
      await stopRecording();
      if (discard) await advanceRecovery(true);
      if (desktop) {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("close_app");
      } else {
        setClosePending(false);
        setError("Close confirmed. You can close this browser tab.");
      }
    } catch (e) {
      setError("Close failed: " + String(e));
    } finally {
      transitionBusy.current = false;
      setTransitionVisible(false);
    }
  }
  const replace = (w: Workspace) => {
    const validated = parseWorkspace(w);
    setHistory((h) => commit(h, validated));
  };
  function editWidget(
    id: string,
    patch: Partial<Widget>,
    screenId = current.current.activeScreenId,
  ) {
    if (current.current.sim.running)
      throw new Error("Stop simulation before editing");
    const w = structuredClone(current.current.history.present),
      target = w.screens.find((s) => s.id === screenId);
    const chosen = target?.widgets.find((widget) => widget.id === id);
    if (!target || !chosen)
      throw new Error("Instrument belongs to a previous project");
    const ids = expandGroups(target, [id]);
    if (patch.rect) {
      if (movableSelection(target, ids).length !== ids.length)
        throw new Error("Group geometry is locked");
      if (ids.length > 1) {
        const old = { ...chosen.rect },
          next = patch.rect;
        if (next.rotation !== old.rotation)
          transformSelection(
            target,
            ids,
            "rotate",
            next.rotation - old.rotation,
            0,
          );
        else if (next.width !== old.width || next.height !== old.height)
          resizeSelectionByFactor(
            target,
            ids,
            next.width !== old.width
              ? next.width / old.width
              : next.height / old.height,
          );
        else
          for (const widget of target.widgets.filter((v) =>
            ids.includes(v.id),
          )) {
            widget.rect.x += next.x - old.x;
            widget.rect.y += next.y - old.y;
          }
        const { rect, ...rest } = patch;
        Object.assign(chosen, rest);
      } else Object.assign(chosen, patch);
    } else if (patch.locked !== undefined)
      for (const widget of target.widgets.filter((v) => ids.includes(v.id)))
        widget.locked = patch.locked;
    else Object.assign(chosen, patch);
    replace(w);
  }
  function command(c: Command) {
    if (
      transitionBusy.current &&
      !(c.type === "write" && c.safetyRelease === true)
    )
      return;

    if ((c.type === "patch" || c.type === "write") && c.screenId === undefined)
      c = { ...c, screenId: current.current.activeScreenId };
    if (c.type === "patch" && c.epoch === undefined)
      c = { ...c, epoch: current.current.sim.epoch };
    if (floating) {
      publish({ kind: "command", command: c });
      return;
    }
    try {
      if (
        (c.type === "patch" || c.type === "write") &&
        !current.current.history.present.screens.some(
          (s) => s.id === c.screenId,
        )
      )
        throw new Error("Editor command belongs to a removed screen");
      if (
        c.type === "write" &&
        c.safetyRelease !== true &&
        (pendingReplacement ||
          newProjectOpen ||
          sourceEditorOpen ||
          closePending ||
          recoveryChoice)
      )
        throw new Error("Finish current dialog before operating controls");
      if (["add", "activateScreen", "configureSources"].includes(c.type)) {
        assertProjectEpoch(current.current.sim, c.epoch);
        if (
          pendingReplacement ||
          newProjectOpen ||
          sourceEditorOpen ||
          closePending ||
          recoveryChoice
        )
          throw new Error(
            "Finish current dialog before changing views or instruments",
          );
        const target = current.current.history.present.screens.find(
          (s) => s.id === c.screenId,
        );
        if (!target) throw new Error("Command belongs to a removed screen");
        if (c.type === "activateScreen") switchScreen(target.id);
        else {
          if (current.current.sim.running)
            throw new Error("Stop before editing instruments or data sources");
          if (c.type === "configureSources") {
            setSourceEditorOpen(true);
            if (desktop)
              void import("@tauri-apps/api/window")
                .then((m) => m.getCurrentWindow().setFocus())
                .catch((e) =>
                  setError("Main editor focus failed: " + String(e)),
                );
          } else {
            if (
              ![
                "radial",
                "linear",
                "numeric",
                "led",
                "slider",
                "switch",
                "button",
                "thermometer",
                "graph",
              ].includes(String(c.kind))
            )
              throw new Error("Unknown instrument kind");
            const doc = structuredClone(current.current.history.present),
              destination = doc.screens.find((s) => s.id === target.id)!;
            const id = crypto.randomUUID(),
              instrument = createInstrument(c.kind as Kind, id);
            instrument.rect = vacantPosition(destination, instrument.rect, {
              x: Math.max(32, (viewport.current?.scrollLeft ?? 0) / zoom),
              y: Math.max(32, (viewport.current?.scrollTop ?? 0) / zoom),
            });
            destination.widgets.push(instrument);
            replace(doc);
            switchScreen(target.id);
            setSelected([id]);
          }
        }
      }
      if (c.type === "write") {
        const w = current.current.history.present.screens
          .find((s) => s.id === c.screenId)!
          .widgets.find((v) => v.id === c.id);
        if (!w?.binding?.writable)
          throw new Error("Widget binding is read-only");
        if (
          c.safetyRelease === true &&
          !heldWrite.current.owns(
            String(c.id),
            String(c.screenId),
            Number(c.epoch),
          )
        )
          throw new Error("Release does not match a held control");
        if (pendingWrite.current) {
          if (
            c.safetyRelease === true &&
            c.value === false &&
            heldWrite.current.owns(
              String(c.id),
              String(c.screenId),
              Number(c.epoch),
            )
          ) {
            releaseWrite.current = { ...c };
            return;
          }
          throw new Error("Previous write is awaiting a result");
        }
        const state = current.current.sim;
        const raw = rawWidgetWrite(
          current.current.history.present,
          state,
          w,
          c.value,
          Number(c.epoch),
        );
        if (operationCounter.current.epoch !== state.epoch)
          operationCounter.current = { epoch: state.epoch, counter: 0 };
        if (operationCounter.current.counter >= Number.MAX_SAFE_INTEGER)
          throw new Error("Operation counter exhausted; create a new session");
        const isHold =
          w.kind === "button" &&
          (w.settings.buttonMode ?? "toggle") !== "toggle";
        if (isHold && c.value === true)
          heldWrite.current.begin(w.id, String(c.screenId), state.epoch);
        const operationId = `${state.epoch}:${++operationCounter.current.counter}`;
        pendingWrite.current = {
          operationId,
          id: w.id,
          screenId: String(c.screenId),
          finalRelease: c.finalRelease === true,
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
            releaseWrite.current = null;
            heldWrite.current.reset();
            const next = newRuntime(
              current.current.history.present.sources,
              current.current.sim.epoch + 1,
              current.current.sim.catalogRevision ?? 1,
              false,
            );
            current.current.sim = next;
            setSim(next);
            setError(
              "Write outcome unknown: no result received. No automatic retry.",
            );
          }
        }, 2000);
      }
      if (c.type === "select") {
        if (typeof c.screenId === "string") {
          assertProjectEpoch(current.current.sim, c.epoch);
          const target = current.current.history.present.screens.find(
            (s) => s.id === c.screenId,
          );
          if (!target || !target.widgets.some((w) => w.id === c.id))
            throw new Error("Unknown screen selection");
          setActiveScreenId(target.id);
          current.current.activeScreenId = target.id;
        }
        setSelected([String(c.id)]);
      }
      if (c.type === "geometry") {
        assertProjectEpoch(current.current.sim, c.epoch);
        if (
          current.current.sim.running ||
          pendingReplacement ||
          newProjectOpen ||
          sourceEditorOpen ||
          closePending ||
          recoveryChoice
        )
          throw new Error("Finish dialogs and Stop before editing");
        const doc = structuredClone(current.current.history.present),
          target = doc.screens.find((s) => s.id === c.screenId);
        if (!target || !Array.isArray(c.patches) || c.patches.length > 1000)
          throw new Error("Invalid screen geometry command");
        const seen = new Set<string>();
        for (const item of c.patches) {
          if (!item || typeof item.id !== "string" || seen.has(item.id))
            throw new Error("Invalid geometry patch");
          seen.add(item.id);
          const widget = target.widgets.find((w) => w.id === item.id);
          if (
            !widget ||
            !movableSelection(target, [widget.id]).includes(widget.id)
          )
            throw new Error("Unknown or locked geometry");
          widget.rect = item.rect;
        }
        replace(doc);
      }
      if (c.type === "dock") {
        if (
          (!(String(c.panel) in defaults) &&
            !current.current.history.present.screens.some(
              (s) => "screen:" + s.id === c.panel,
            )) ||
          !["top", "bottom", "left", "right", "hidden"].includes(String(c.edge))
        )
          throw new Error("Invalid docking command");
        dockPanel(
          String(c.panel) as Panel,
          c.edge as Edge,
          c.autoHide === true,
        );
        if (desktop)
          void import("@tauri-apps/api/webviewWindow")
            .then(async (m) => {
              const win = await m.WebviewWindow.getByLabel(
                nativeLabel(String(c.panel)),
              );
              await win?.destroy();
            })
            .catch((error) =>
              setError("Native redock failed: " + String(error)),
            );
      }
      if (c.type === "patch") {
        assertProjectEpoch(current.current.sim, c.epoch);
        if (
          pendingReplacement ||
          newProjectOpen ||
          sourceEditorOpen ||
          closePending ||
          recoveryChoice
        )
          throw new Error("Finish the project dialog before editing");
        if (current.current.sim.running)
          throw new Error("Stop simulation before editing");
        editWidget(
          String(c.id),
          c.patch as Partial<Widget>,
          String(c.screenId),
        );
      }
      if (c.type === "hello")
        publish({
          kind: "snapshot",
          data: {
            workspace: current.current.history.present,
            sim: current.current.sim,
            selected: current.current.selected,
            activeScreenId: current.current.activeScreenId,
            layout: current.current.layout,
            dockLayout: current.current.dockLayout,
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
        if (
          (m.command?.type === "patch" || m.command?.type === "write") &&
          (m.command.epoch === undefined ||
            typeof m.command.screenId !== "string")
        ) {
          setError("Editor command missing project session");
          return;
        }
        commandRef.current(m.command);
      }
      if (floating && m.kind === "snapshot") {
        try {
          const d = m.data as Snapshot,
            doc = parseWorkspace(d.workspace),
            runtime = parseSim(d.sim);
          if (
            typeof d.activeScreenId !== "string" ||
            !doc.screens.some((s) => s.id === d.activeScreenId)
          )
            throw new Error("Unknown active screen");
          const validDock = parseDockLayout(d.dockLayout, [
            ...Object.keys(defaults),
            ...doc.screens.map((s) => "screen:" + s.id),
          ]);
          const ids = new Set(
            doc.screens.flatMap((s) => s.widgets.map((w) => w.id)),
          );
          if (
            !Array.isArray(d.selected) ||
            d.selected.length > 1000 ||
            new Set(d.selected).size !== d.selected.length ||
            d.selected.some((id) => typeof id !== "string" || !ids.has(id))
          )
            throw new Error("Invalid shared selection");
          const target = floating?.startsWith("screen:")
            ? floating.slice(7)
            : d.activeScreenId;
          if (!doc.screens.some((s) => s.id === target)) {
            setError("This screen was removed; the floating view will close.");
            if (desktop)
              void import("@tauri-apps/api/window").then(
                ({ getCurrentWindow }) => getCurrentWindow().destroy(),
              );
            return;
          }
          setHistory({ past: [], present: doc, future: [] });
          setSim(runtime);
          setActiveScreenId(target);
          setSelected(d.selected);
          setDockLayout(validDock);
          setLayout(dockPanelLocations(validDock));
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
      publish({
        kind: "snapshot",
        data: { workspace, sim, selected, layout, dockLayout, activeScreenId },
      });
  }, [workspace, sim, selected, layout, dockLayout, activeScreenId]);
  useEffect(() => {
    if (floating) return;
    const w = new Worker(new URL("./simulator.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.current = w;
    w.onerror = (event) => setError("Offline worker error: " + event.message);
    w.onmessage = (e) => {
      const receivedAt = performance.now();
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
          const started = receivedAt;
          const next = applyBatch(state, m, sources);
          if (next !== state) {
            boundedMetric(
              performanceMetrics.current.processingMs,
              performance.now() - started,
            );
            performanceMetrics.current.receivedAt = started;
            performanceMetrics.current.lastTick = next.tick;
          }
          if (next !== state) {
            const active = recorder.current;
            if (
              active &&
              active.epoch === m.epoch &&
              active.catalogRevision === m.catalogRevision
            )
              active.recorder.append(
                batchLogFrame(
                  m,
                  catalogFor(sources),
                  next.frames!.at(-1)!.hostReceivedAtUtc,
                ),
              );
          }
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
          if (m.status === "unknown") {
            releaseWrite.current = null;
            heldWrite.current.reset();
            const next = newRuntime(
              sources,
              state.epoch + 1,
              state.catalogRevision ?? 1,
              false,
            );
            current.current.sim = next;
            setSim(next);
            throw new Error(
              "Write outcome unknown: simulation stopped and session invalidated. No retry. " +
                m.reason,
            );
          }
          if (m.status !== "acknowledged") {
            const release = releaseWrite.current;
            releaseWrite.current = null;
            if (release) queueMicrotask(() => commandRef.current(release));
            throw new Error("Write " + m.status + ": " + m.reason);
          }
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
          if (pending.finalRelease && pending.value === false)
            heldWrite.current.release(
              pending.id,
              pending.screenId,
              pending.epoch,
            );
          const release = releaseWrite.current;
          releaseWrite.current = null;
          if (release) queueMicrotask(() => commandRef.current(release));
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
    const active = recorder.current;
    if (
      active &&
      (!sim.running ||
        active.epoch !== sim.epoch ||
        active.catalogRevision !== sim.catalogRevision)
    )
      void stopRecording().catch((error) =>
        setError("Partial recording: " + String(error)),
      );
  }, [sim.running, sim.epoch, sim.catalogRevision]);
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
    releaseWrite.current = null;
    heldWrite.current.reset();
    current.current.sim = next;
    setSim(next);
  }, [sourceConfig]);
  useEffect(() => {
    if (!floating && !deferredLayout.current) {
      try {
        localStorage.setItem("olw-layout", JSON.stringify(dockLayout));
        localStorage.setItem("olw-layout-workspace", workspace.id);
      } catch (error) {
        setError("Layout persistence failed: " + String(error));
      }
    }
  }, [dockLayout]);
  useEffect(() => {
    const pending = deferredLayout.current;
    if (
      floating ||
      !pending ||
      !recoveryLoaded ||
      recoveryChoice ||
      pending.workspaceId !== workspace.id
    )
      return;
    try {
      const allowed = [
        ...Object.keys(defaults),
        ...workspace.screens.map((s) => "screen:" + s.id),
      ];
      let next = pending.layout;
      for (const panel of Object.keys(dockPanelLocations(next)))
        if (!allowed.includes(panel)) next = detachPanel(next, panel);
      updateDockLayout(parseDockLayout(next, allowed));
    } catch (error) {
      deferredLayout.current = null;
      setError("Saved screen layout rejected: " + String(error));
    }
  }, [workspace.id, recoveryLoaded, !!recoveryChoice]);
  const restoringFloats = useRef(new Set<string>());
  useEffect(() => {
    if (floating || !desktop || !recoveryLoaded || recoveryChoice) return;
    const allowed = [
      ...Object.keys(defaults),
      ...workspace.screens.map((s) => "screen:" + s.id),
    ];
    let next = current.current.dockLayout;
    for (const panel of Object.keys(dockPanelLocations(next)))
      if (!allowed.includes(panel)) next = detachPanel(next, panel);
    if (next !== current.current.dockLayout) updateDockLayout(next);
    for (const entry of next.floating) {
      if (restoringFloats.current.has(entry.panel)) continue;
      restoringFloats.current.add(entry.panel);
      void float(entry.panel as Panel, entry.bounds).finally(() =>
        restoringFloats.current.delete(entry.panel),
      );
    }
  }, [
    dockLayout.floating.map((f) => f.panel).join("|"),
    workspace.screens.map((s) => s.id).join("|"),
    recoveryLoaded,
    !!recoveryChoice,
  ]);
  useEffect(() => {
    const locations = dockPanelLocations(dockLayout);
    current.current.layout = locations;
    setLayout(locations);
  }, [dockLayout]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (e.defaultPrevented) return;
      if (transitionBusy.current) {
        e.preventDefault();
        return;
      }
      if (
        pendingReplacement ||
        newProjectOpen ||
        sourceEditorOpen ||
        closePending ||
        recoveryChoice
      ) {
        if (e.key === "Escape" && !saving) {
          setPendingReplacement(null);
          setNewProjectOpen(false);
          setSourceEditorOpen(false);
          setClosePending(false);
        }
        return;
      }
      if (
        (e.target as HTMLElement).closest(
          "input,select,textarea,[contenteditable=true]",
        )
      )
        return;
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === "Escape" && marqueeStart.current) {
        setSelected(marqueeStart.current.previous);
        marqueeStart.current = null;
        setMarquee(null);
        return;
      }
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
      if (mod && e.key.toLowerCase() === "c") {
        e.preventDefault();
        copySelection();
      }
      if (mod && e.key.toLowerCase() === "v") {
        e.preventDefault();
        pasteSelection();
      }
      if (mod && e.key.toLowerCase() === "g") {
        e.preventDefault();
        applyEditor(e.shiftKey ? "ungroup" : "group");
      }
      if (e.key === "Delete") remove();
      if (
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key) &&
        !sim.running
      ) {
        e.preventDefault();
        const w = structuredClone(current.current.history.present);
        for (const v of w.screens.find(
          (s) => s.id === current.current.activeScreenId,
        )!.widgets)
          if (movableSelection(screen, selected).includes(v.id)) {
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
  function applyEditor(action: EditorAction) {
    if (current.current.sim.running) return;
    try {
      replace(
        editorCommand(
          current.current.history.present,
          current.current.activeScreenId,
          current.current.selected,
          action,
        ),
      );
    } catch (e) {
      setError(String(e));
    }
  }
  function copySelection() {
    const state = current.current,
      screen = state.history.present.screens.find(
        (s) => s.id === state.activeScreenId,
      );
    if (!screen) return;
    clipboard.current = structuredClone(
      screen.widgets.filter((w) =>
        expandGroups(screen, state.selected).includes(w.id),
      ),
    );
  }
  function pasteSelection() {
    const state = current.current;
    if (state.sim.running) return;
    try {
      const result = pasteWidgets(
        state.history.present,
        state.activeScreenId,
        clipboard.current,
      );
      replace(result.workspace);
      setSelected(result.ids);
    } catch (e) {
      setError(String(e));
    }
  }
  function add(kind: Kind) {
    command({
      type: "add",
      kind,
      screenId: screen.id,
      epoch: current.current.sim.epoch,
    });
  }
  function remove() {
    applyEditor("delete");
    setSelected([]);
  }
  function duplicate() {
    copySelection();
    pasteSelection();
  }
  function switchScreen(id: string) {
    gesture.current = null;
    marqueeStart.current = null;
    setMarquee(null);
    setSelected([]);
    setActiveScreenId(id);
    current.current.activeScreenId = id;
    viewport.current?.scrollTo(0, 0);
  }
  function addScreen() {
    if (sim.running) return;
    const w = structuredClone(workspace);
    const id = crypto.randomUUID();
    w.screens.push({
      id,
      name: `Screen ${w.screens.length + 1}`,
      kind: "dashboard",
      canvas: structuredClone(screen.canvas),
      widgets: [],
    });
    try {
      replace(w);
      switchScreen(id);
    } catch (e) {
      setError(String(e));
    }
  }
  function deleteScreen() {
    if (sim.running || workspace.screens.length === 1) return;
    const w = structuredClone(workspace);
    w.screens = w.screens.filter((s) => s.id !== screen.id);
    replace(w);
    switchScreen(w.screens[0].id);
  }
  function pointerStart(e: React.PointerEvent, id: string, kind = "move") {
    if (sim.running) return;
    e.stopPropagation();
    const ids = expandGroups(
      screen,
      e.shiftKey
        ? [...new Set([...selected, id])]
        : selected.includes(id)
          ? selected
          : [id],
    );
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
    const target = w.screens.find(
      (s) => s.id === current.current.activeScreenId,
    )!;
    const groupTransformed = transformSelection(target, g.ids, g.kind, dx, dy);
    for (const v of target.widgets.filter(
      (v) =>
        movableSelection(target, g.ids).includes(v.id) && !groupTransformed,
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
    if (floating?.startsWith("screen:")) {
      const target = current.current.history.present.screens.find(
        (s) => s.id === floating.slice(7),
      );
      if (target)
        command({
          type: "geometry",
          epoch: current.current.sim.epoch,
          screenId: target.id,
          patches: target.widgets
            .filter((w) => g.ids.includes(w.id))
            .map((w) => ({ id: w.id, rect: w.rect })),
        });
    } else setHistory((h) => commit({ ...h, present: g.start }, h.present));
  }
  async function float(panel: Panel, restoringBounds?: WindowBounds) {
    setError("");
    if (!desktop) {
      setError(
        "Native floating panels require the desktop build. Use docking here.",
      );
      return;
    }
    try {
      const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
      const existing = await WebviewWindow.getByLabel(nativeLabel(panel));
      if (existing) {
        await existing.setFocus();
        return;
      }
      if (
        current.current.dockLayout.floating.length >= 16 &&
        !current.current.dockLayout.floating.some((f) => f.panel === panel)
      )
        throw new Error("At most 16 native floating views");
      const { availableMonitors } = await import("@tauri-apps/api/window");
      const monitors = await availableMonitors();
      const remembered =
        restoringBounds ??
        current.current.dockLayout.floating.find((f) => f.panel === panel)
          ?.bounds;
      const entry = current.current.dockLayout.floating.find(
        (f) => f.panel === panel,
      );
      const bounds = restoreNativeBounds(
        remembered,
        entry?.monitorHint,
        monitors,
      );
      const win = new WebviewWindow(nativeLabel(panel), {
        url: "index.html?panel=" + encodeURIComponent(panel),
        title: "Open Live Watch — " + panel,
        width: bounds.width,
        height: bounds.height,
        minWidth: 240,
        minHeight: 160,
      });
      await win.once("tauri://created", async () => {
        try {
          if (
            panel.startsWith("screen:") &&
            !current.current.history.present.screens.some(
              (s) => "screen:" + s.id === panel,
            )
          ) {
            await win.destroy();
            return;
          }
          const { LogicalSize, PhysicalPosition } = await import(
            "@tauri-apps/api/dpi"
          );
          const outer = await win.outerSize(),
            inner = await win.innerSize(),
            createdScale = await win.scaleFactor();
          const fitted = restoreNativeBounds(
            remembered,
            entry?.monitorHint,
            await availableMonitors(),
            logicalDecoration(outer, inner, createdScale),
          );
          await win.setSize(new LogicalSize(fitted.width, fitted.height));
          await win.setPosition(new PhysicalPosition(fitted.x, fitted.y));
          if (
            !current.current.dockLayout.floating.some((f) => f.panel === panel)
          )
            dockPanel(panel, "floating");
          remember();
        } catch (error) {
          setError("Floating view restore failed: " + String(error));
        }
      });
      let boundsTimer: ReturnType<typeof setTimeout> | undefined;
      const remember = () => {
        clearTimeout(boundsTimer);
        boundsTimer = setTimeout(async () => {
          try {
            const factor = await win.scaleFactor(),
              position = await win.outerPosition(),
              size = await win.innerSize();
            const captured = captureNativeBounds(
              position,
              size,
              factor,
              await availableMonitors(),
            );
            const now = current.current.dockLayout;
            if (now.floating.some((f) => f.panel === panel))
              updateDockLayout({
                ...now,
                floating: now.floating.map((f) =>
                  f.panel === panel
                    ? {
                        ...f,
                        ...captured,
                      }
                    : f,
                ),
              });
          } catch (error) {
            setError("Native window bounds not saved: " + String(error));
          }
        }, 250);
      };
      await win.onMoved(remember);
      await win.onResized(remember);
      await win.once("tauri://error", (e) =>
        setError("Floating window failed: " + String(e.payload)),
      );
      await win.onCloseRequested(() => {
        if (current.current.layout[panel] === "floating")
          dockPanel(panel, defaults[panel] ?? "hidden");
      });
    } catch (e) {
      setError(String(e));
    }
  }
  async function applyReplacement(
    next: NonNullable<typeof pendingReplacement>,
    restoring = false,
  ) {
    if (transitionBusy.current) return;
    transitionBusy.current = true;
    setTransitionVisible(true);
    try {
      if (
        recorder.current ||
        recordingStop.current ||
        recordingStartTask.current
      )
        await stopRecording();
    } catch (error) {
      setError(
        "Replacement canceled: recording flush failed: " + String(error),
      );
      transitionBusy.current = false;
      setTransitionVisible(false);
      return;
    }
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
    setActiveScreenId(project.history.present.screens[0].id);
    current.current.activeScreenId = project.history.present.screens[0].id;
    clipboard.current = [];
    setMarquee(null);
    setQuery("");
    setZoom(1);
    setPendingReplacement(null);
    if (!restoring) void advanceRecovery(true).catch(() => {});
    setError("");
    viewport.current?.scrollTo(0, 0);
    transitionBusy.current = false;
    setTransitionVisible(false);
  }
  function requestReplacement(next: NonNullable<typeof pendingReplacement>) {
    if (transitionBusy.current) return;
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
      await advanceRecovery(true);
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
    if (newProjectOpen || pendingReplacement || closePending || recoveryChoice)
      document
        .querySelector<HTMLElement>(
          '[role="dialog"] input,[role="dialog"] button',
        )
        ?.focus();
  }, [newProjectOpen, pendingReplacement, closePending, recoveryChoice]);
  function content(panel: Panel) {
    if (panel.startsWith("screen:"))
      return floating === panel ? (
        canvasView()
      ) : (
        <ScreenView
          workspace={workspace}
          sim={sim}
          screenId={panel.slice(7)}
          onCommand={command}
        />
      );
    if (panel === "explorer")
      return (
        <div className="tree">
          <strong>▾ {workspace.name}</strong>
          <div>▾ Screens</div>
          {workspace.screens.map((s) => (
            <button
              key={s.id}
              className={s.id === screen.id ? "tree-selected" : ""}
              onClick={() =>
                command({
                  type: "activateScreen",
                  screenId: s.id,
                  epoch: sim.epoch,
                })
              }
            >
              ▣ {s.name}
            </button>
          ))}
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
          <button
            disabled={sim.running}
            onClick={() =>
              command({
                type: "configureSources",
                screenId: screen.id,
                epoch: sim.epoch,
              })
            }
          >
            Configure data sources
          </button>
        </div>
      );
    if (panel === "toolbox")
      return (
        <div className="toolbox">
          <p className="toolbox-destination">Add to {screen.name}</p>
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
            <button key={k} disabled={sim.running} onClick={() => add(k)}>
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
              Stable catalog Y axis
            </label>
            <p>
              Catalog ranges keep changing values visibly moving. Manual Y uses
              Display scale limits. History is bounded to 600 coherent
              simulation frames.
            </p>
          </fieldset>
        )}
        {chosen.kind === "graph" && (
          <label>
            Trace display
            <select
              aria-label="Graph trace display"
              disabled={sim.running}
              value={
                chosen.settings.graph?.traceMode ??
                (chosen.settings.graph?.mode === "xy" ? "points" : "line")
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
                        traceMode: e.target.value as "line" | "points",
                      },
                    },
                  },
                })
              }
            >
              <option value="line">Connected trajectory</option>
              <option value="points">Scatter points</option>
            </select>
          </label>
        )}
        {chosen.kind === "graph" && (
          <GraphSeriesEditor
            widget={chosen}
            sources={workspace.sources}
            disabled={sim.running}
            onChange={(graph) =>
              command({
                type: "patch",
                id: chosen.id,
                patch: { settings: { ...chosen.settings, graph } },
              })
            }
          />
        )}
        {chosen.kind === "button" && (
          <fieldset>
            <legend>Button behavior</legend>
            <label>
              Mode
              <select
                aria-label="Button behavior"
                disabled={sim.running}
                value={chosen.settings.buttonMode ?? "toggle"}
                onChange={(e) =>
                  command({
                    type: "patch",
                    id: chosen.id,
                    patch: {
                      settings: {
                        ...chosen.settings,
                        buttonMode: e.target.value as
                          | "toggle"
                          | "momentary"
                          | "repeat",
                      },
                    },
                  })
                }
              >
                <option value="toggle">Toggle</option>
                <option value="momentary">Momentary hold</option>
                <option value="repeat">Repeat pulse while held</option>
              </select>
            </label>
            {chosen.settings.buttonMode === "repeat" && (
              <label>
                Pulse interval (ms)
                <input
                  type="number"
                  min="200"
                  max="5000"
                  disabled={sim.running}
                  value={chosen.settings.repeatMs ?? 500}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isInteger(n) && n >= 200 && n <= 5000)
                      command({
                        type: "patch",
                        id: chosen.id,
                        patch: {
                          settings: { ...chosen.settings, repeatMs: n },
                        },
                      });
                  }}
                />
              </label>
            )}
            <p>
              Release, focus loss, or pointer cancellation ends the hold. Stop
              cancels without replaying commands.
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
            checked={!!chosen.locked}
            disabled={sim.running}
            onChange={(e) =>
              command({
                type: "patch",
                id: chosen.id,
                patch: { locked: e.target.checked },
              })
            }
          />
          Lock geometry (saved)
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
          if (id in defaults) {
            const target = dockNodes(current.current.dockLayout.root).find(
              (n) => n.type === "tabs" && n.panels.includes(panel),
            );
            if (target)
              updateDockLayout(
                placePanel(current.current.dockLayout, id, target.id, "tab"),
              );
          }
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
              value={
                dockNodes(dockLayout.root).some(
                  (n) => n.type === "tabs" && n.panels.includes(panel),
                )
                  ? "docked"
                  : (layout[panel] ?? "floating")
              }
              onChange={(e) =>
                command({ type: "dock", panel, edge: e.target.value })
              }
            >
              <option value="docked" disabled>
                Docked
              </option>
              {["top", "left", "right", "bottom", "hidden", "floating"].map(
                (edge) => (
                  <option key={edge} disabled={edge === "floating"}>
                    {edge}
                  </option>
                ),
              )}
            </select>
            {!floating && (
              <select
                aria-label={"Auto-hide " + panel}
                value=""
                onChange={(e) => {
                  if (e.target.value)
                    command({
                      type: "dock",
                      panel,
                      edge: e.target.value,
                      autoHide: true,
                    });
                }}
              >
                <option value="">Pin / auto-hide…</option>
                {["top", "left", "right", "bottom"].map((edge) => (
                  <option key={edge} value={edge}>
                    Auto-hide {edge}
                  </option>
                ))}
              </select>
            )}
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
                  edge: floating ? (defaults[panel] ?? "hidden") : "hidden",
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
  function canvasView() {
    return (
      <div className="document">
        <div
          className="document-tab screen-tabs"
          role="tablist"
          aria-label="Project screens"
        >
          {(floating?.startsWith("screen:") ? [screen] : workspace.screens).map(
            (s) => (
              <button
                role="tab"
                aria-selected={s.id === screen.id}
                key={s.id}
                onClick={() => switchScreen(s.id)}
              >
                {s.name}
              </button>
            ),
          )}
          <button
            disabled={
              !!floating || sim.running || workspace.screens.length >= 64
            }
            onClick={addScreen}
          >
            + Screen
          </button>
          <button
            disabled={
              !!floating || sim.running || workspace.screens.length === 1
            }
            onClick={deleteScreen}
          >
            Delete screen
          </button>
          {!floating && (
            <button
              onClick={() => void float(("screen:" + screen.id) as Panel)}
            >
              Float screen view
            </button>
          )}
          <input
            aria-label="Screen name"
            disabled={!!floating || sim.running}
            value={screen.name}
            onChange={(e) => {
              if (!e.target.value.trim()) return;
              const w = structuredClone(workspace);
              w.screens.find((s) => s.id === screen.id)!.name = e.target.value;
              replace(w);
            }}
          />
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
              onPointerDown={(e) => {
                if (sim.running || e.target !== e.currentTarget) return;
                const box = e.currentTarget.getBoundingClientRect();
                const x = (e.clientX - box.left) / zoom,
                  y = (e.clientY - box.top) / zoom;
                marqueeStart.current = {
                  x,
                  y,
                  ids: e.shiftKey ? selected : [],
                  previous: selected,
                };
                setMarquee({ x, y, width: 0, height: 0 });
                e.currentTarget.setPointerCapture(e.pointerId);
                if (!e.shiftKey) setSelected([]);
              }}
              onPointerMove={(e) => {
                const start = marqueeStart.current;
                if (!start) return;
                const box = e.currentTarget.getBoundingClientRect(),
                  x = (e.clientX - box.left) / zoom,
                  y = (e.clientY - box.top) / zoom;
                const rect = {
                  x: Math.min(start.x, x),
                  y: Math.min(start.y, y),
                  width: Math.abs(x - start.x),
                  height: Math.abs(y - start.y),
                };
                setMarquee(rect);
                setSelected([
                  ...new Set([...start.ids, ...marqueeSelection(screen, rect)]),
                ]);
              }}
              onPointerUp={() => {
                marqueeStart.current = null;
                setMarquee(null);
              }}
            >
              {marquee && <div className="selection-marquee" style={marquee} />}
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
                      sessionEpoch={sim.epoch}
                      onWrite={(value, safetyRelease, finalRelease) =>
                        command({
                          type: "write",
                          id: w.id,
                          value,
                          safetyRelease,
                          finalRelease,
                          screenId: screen.id,
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
                          onPointerDown={(e) => pointerStart(e, w.id, "rotate")}
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
        <button className="exit-app" onClick={() => closeRequest.current()}>
          Close project window
        </button>
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
                    historyCsv(sim, catalogFor(workspace.sources)),
                    "recent-samples.csv",
                    "text/csv",
                  )
                }
              >
                Export recent CSV
              </button>
              <button
                disabled={
                  !desktop || !sim.running || recordingActive || recordingBusy
                }
                onClick={() => void startRecording()}
                title="Continuous recording requires the desktop app; export recent CSV is available here."
              >
                {recordingBusy ? "Starting recording…" : "Start recording…"}
              </button>
              <button
                disabled={!recordingActive}
                onClick={() =>
                  void stopRecording().catch((error) => setError(String(error)))
                }
              >
                Stop recording
              </button>
              <small role="status">{recordingStatus}</small>
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
              <input
                aria-label="Layout name"
                maxLength={64}
                value={layoutName}
                onChange={(e) => setLayoutName(e.target.value)}
              />
              <button onClick={saveNamedLayout}>Save named layout</button>
              <select
                aria-label="Load named layout"
                value=""
                onChange={(e) => void loadNamedLayout(e.target.value)}
              >
                <option value="">Load layout…</option>
                {namedLayouts.map((n) => (
                  <option key={n.name} value={n.name}>
                    {n.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => {
                  const next = namedLayouts.filter(
                    (n) => n.name !== layoutName.trim(),
                  );
                  localStorage.setItem(
                    "olw-named-layouts",
                    JSON.stringify(next),
                  );
                  setNamedLayouts(next);
                }}
              >
                Delete named layout
              </button>
            </div>
            <div className="group">
              <button
                onClick={() => {
                  const owned = current.current.dockLayout.floating.map(
                    (f) => f.panel,
                  );
                  updateDockLayout(defaultDockLayout());
                  if (desktop)
                    void import("@tauri-apps/api/webviewWindow")
                      .then(async (m) => {
                        for (const p of owned) {
                          const w = await m.WebviewWindow.getByLabel(
                            nativeLabel(p),
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
                  command({
                    type: "dock",
                    panel: p,
                    edge: defaults[p as Panel],
                  })
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
                  if (state.running)
                    void stopRecording().catch((error) =>
                      setError(String(error)),
                    );
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
              <select
                aria-label="Selection command"
                disabled={sim.running || !selected.length}
                value=""
                onChange={(e) => applyEditor(e.target.value as EditorAction)}
              >
                <option value="">Arrange selection…</option>
                {(
                  [
                    "align-left",
                    "align-right",
                    "align-top",
                    "align-bottom",
                    "align-center-x",
                    "align-center-y",
                    "distribute-x",
                    "distribute-y",
                    "front",
                    "back",
                    "forward",
                    "backward",
                    "group",
                    "ungroup",
                    "lock",
                    "unlock",
                  ] as EditorAction[]
                ).map((action) => (
                  <option key={action} value={action}>
                    {action.replaceAll("-", " ")}
                  </option>
                ))}
              </select>
              <button
                disabled={sim.running || !selected.length}
                onClick={copySelection}
              >
                Copy
              </button>
              <button disabled={sim.running} onClick={pasteSelection}>
                Paste
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
      <DockHost
        layout={dockLayout}
        onChange={updateDockLayout}
        canvas={canvasView()}
        renderPanel={(panel) => panelView(panel as Panel)}
      />

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
          {overlapIds(screen, selected).length > 0 && (
            <span className="overlap-warning">
              Selection overlaps another instrument • use Arrange or drag
              apart.{" "}
            </span>
          )}
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
      {!floating && tab === "View" && (
        <label className="diagnostics-toggle">
          <input
            type="checkbox"
            checked={showDiagnostics}
            onChange={(e) => setShowDiagnostics(e.target.checked)}
          />
          Performance diagnostics
        </label>
      )}
      {transitionVisible && (
        <div className="modal-backdrop">
          <div className="project-dialog" role="status">
            Finishing recording before the project transition…
          </div>
        </div>
      )}
      {showDiagnostics && !floating && (
        <Diagnostics
          sim={sim}
          workspace={workspace}
          metrics={performanceMetrics.current}
          queueBytes={recorder.current?.recorder.queuedBytes ?? 0}
        />
      )}
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
      {recoveryChoice && (
        <div className="modal-backdrop">
          <div
            className="project-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Recover project"
            onKeyDown={trapModalFocus}
          >
            <h2>
              {recoveryChoice.status === "valid"
                ? "Restore recovered project?"
                : "Recovery requires attention"}
            </h2>
            <p>
              {recoveryChoice.status === "valid"
                ? recoveryChoice.snapshot.workspace.name +
                  " has a validated recovery snapshot. Restore opens it stopped with unsaved changes."
                : recoveryChoice.status === "corrupt"
                  ? recoveryChoice.reason
                  : ""}
            </p>
            <p>
              Recovery is preserved until you explicitly restore or discard it.
            </p>
            <div className="dialog-actions">
              <button
                onClick={async () => {
                  try {
                    await recoveryInvoke("recovery_clear", {
                      generation: recoveryGeneration.current ?? 0,
                    });
                    setRecoveryChoice(null);
                    await advanceRecovery(false, true);
                  } catch (e) {
                    setError(String(e));
                  }
                }}
              >
                Discard recovery
              </button>
              {recoveryChoice.status === "valid" && (
                <button
                  onClick={() => {
                    const snapshot = parseRecovery(recoveryChoice.snapshot);
                    setRecoveryChoice(null);
                    applyReplacement(
                      {
                        workspace: snapshot.workspace,
                        path: snapshot.savedPath,
                        label: "restore recovery",
                        unsaved: true,
                      },
                      true,
                    );
                    void advanceRecovery(false, true).catch(() => {});
                  }}
                >
                  Restore project
                </button>
              )}
            </div>
          </div>
        </div>
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
      {(pendingReplacement || closePending) && (
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
              to {pendingReplacement?.label ?? "close the application"}.
            </p>
            {error && (
              <p role="alert" className="dialog-error">
                {error}
              </p>
            )}
            <div className="dialog-actions">
              <button
                disabled={saving}
                onClick={() => {
                  setPendingReplacement(null);
                  setClosePending(false);
                }}
              >
                Cancel
              </button>
              <button
                disabled={saving}
                onClick={() => {
                  if (closePending) void finishClose(true);
                  else if (pendingReplacement)
                    applyReplacement(pendingReplacement);
                }}
              >
                Discard changes
              </button>
              <button
                disabled={saving}
                onClick={async () => {
                  const next = pendingReplacement;
                  if (await save()) {
                    if (closePending) await finishClose(false);
                    else if (next) applyReplacement(next);
                  }
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
