// @vitest-environment jsdom
import { it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
  cleanup,
} from "@testing-library/react";
import { App } from "./App";
import { createBlankWorkspace, createInstrument } from "./model";
import { defaultDockLayout, setPanelLocation } from "./docking";
import * as recoveryApi from "./recovery";
const api = vi.hoisted(() => ({
  invoke: vi.fn(),
  emit: vi.fn(async (..._args: any[]) => {}),
  mainFocus: vi.fn(async () => {}),
  save: vi.fn(),
  open: vi.fn(),
  receive: null as any,
  nativeWindow: null as any,
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: api.invoke }));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: api.save,
  open: api.open,
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onCloseRequested: async () => () => {},
    setFocus: api.mainFocus,
  }),
}));
vi.mock("@tauri-apps/api/webviewWindow", () => ({
  WebviewWindow: { getByLabel: async () => api.nativeWindow },
}));
vi.mock("@tauri-apps/api/event", () => ({
  emit: api.emit,
  listen: async (_name: string, receive: any) => {
    api.receive = receive;
    return () => {};
  },
}));
afterEach(() => {
  cleanup();
  delete (window as any).__TAURI_INTERNALS__;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  api.invoke.mockReset();
  api.save.mockReset();
  api.nativeWindow = null;
  api.emit.mockClear();
  api.mainFocus.mockClear();
  localStorage.clear();
});
it("awaits canceled pending native start and its flush before close without admitting a late recorder", async () => {
  (window as any).__TAURI_INTERNALS__ = {};
  class Worker {
    postMessage() {}
    terminate() {}
    onmessage = null;
    onerror = null;
  }
  class Channel {
    postMessage() {}
    close() {}
    onmessage = null;
  }
  vi.stubGlobal("Worker", Worker);
  vi.stubGlobal("BroadcastChannel", Channel);
  HTMLElement.prototype.scrollTo = () => {};
  const doc = createBlankWorkspace("Pending native recording");
  doc.sources = [
    {
      id: "lab",
      provider: "offline",
      path: "inline",
      variables: [
        {
          id: "n",
          type: "number",
          units: "V",
          initial: 1,
          min: 0,
          max: 10,
          writable: true,
          waveform: "constant",
          periodMs: 1000,
        },
      ],
    },
  ];
  vi.spyOn(recoveryApi, "recoveryInvoke").mockImplementation((async (
    c: string,
  ) =>
    c === "recovery_read"
      ? {
          status: "valid",
          generation: 0,
          snapshot: {
            formatVersion: 1,
            generation: 0,
            revision: 1,
            savedPath: null,
            workspace: doc,
          },
        }
      : 1) as typeof recoveryApi.recoveryInvoke);
  let startResolve!: (id: number) => void, flushResolve!: () => void;
  api.save.mockResolvedValue("C:/temp/new-log.csv");
  api.invoke.mockImplementation((c: string) =>
    c === "start_recording"
      ? new Promise<number>((r) => (startResolve = r))
      : c === "finish_recording"
        ? new Promise<void>((r) => (flushResolve = r))
        : Promise.resolve(),
  );
  render(<App />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Restore project" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "▶ Run" }));
  fireEvent.click(screen.getByRole("button", { name: "File" }));
  fireEvent.click(screen.getByRole("button", { name: "Start recording…" }));
  await waitFor(() => expect(startResolve).toBeTruthy());
  expect(
    screen
      .getByRole("button", { name: "Starting recording…" })
      .hasAttribute("disabled"),
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Close project window" }));
  fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
  expect(api.invoke).not.toHaveBeenCalledWith("close_app");
  await act(async () => startResolve(42));
  await waitFor(() => expect(flushResolve).toBeTruthy());
  expect(api.invoke).not.toHaveBeenCalledWith("close_app");
  expect(
    screen.getByText("Finishing recording before the project transition…"),
  ).toBeTruthy();
  await act(async () => flushResolve());
  await waitFor(() => expect(api.invoke).toHaveBeenCalledWith("close_app"));
  expect(api.invoke).not.toHaveBeenCalledWith(
    "append_recording",
    expect.anything(),
  );
});

it("freezes a clean project during replacement flush and retains it on sink failure", async () => {
  (window as any).__TAURI_INTERNALS__ = {};
  class Worker {
    static latest: Worker;
    posts: any[] = [];
    constructor() {
      Worker.latest = this;
    }
    postMessage(m: any) {
      this.posts.push(m);
    }
    terminate() {}
    onmessage = null;
    onerror = null;
  }
  class Channel {
    static latest: Channel;
    constructor() {
      Channel.latest = this;
    }
    postMessage() {}
    close() {}
    onmessage: any = null;
  }
  vi.stubGlobal("Worker", Worker);
  vi.stubGlobal("BroadcastChannel", Channel);
  HTMLElement.prototype.scrollTo = () => {};
  const doc = createBlankWorkspace("Clean original");
  doc.sources = [
    {
      id: "lab",
      provider: "offline",
      path: "inline",
      variables: [
        {
          id: "n",
          type: "number",
          units: "V",
          initial: 1,
          min: 0,
          max: 10,
          writable: true,
          waveform: "constant",
          periodMs: 1000,
        },
      ],
    },
  ];
  doc.screens[0].widgets = [createInstrument("numeric", "original-widget")];
  doc.screens[0].widgets[0].title = "Original reading";
  vi.spyOn(recoveryApi, "recoveryInvoke").mockImplementation((async (
    c: string,
  ) =>
    c === "recovery_read"
      ? { status: "missing" }
      : 1) as typeof recoveryApi.recoveryInvoke);
  let flushReject!: (e: Error) => void;
  api.open.mockResolvedValue("C:/temp/clean.olw.json");
  api.save.mockResolvedValue("C:/temp/log.csv");
  api.invoke.mockImplementation((c: string) =>
    c === "load_workspace"
      ? Promise.resolve(JSON.stringify(doc))
      : c === "start_recording"
        ? Promise.resolve(1)
        : c === "finish_recording"
          ? new Promise<void>((_, reject) => (flushReject = reject))
          : Promise.resolve(),
  );
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "File" }));
  fireEvent.click(screen.getByRole("button", { name: "Open project" }));
  await screen.findAllByText(/Clean original/);
  fireEvent.click(screen.getByRole("button", { name: "Design" }));
  fireEvent.click(screen.getByRole("button", { name: "▶ Run" }));
  fireEvent.click(screen.getByRole("button", { name: "File" }));
  fireEvent.click(screen.getByRole("button", { name: "Start recording…" }));
  await screen.findByText(/Recording all variables/);
  fireEvent.click(screen.getByRole("button", { name: "New project" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Project name" }), {
    target: { value: "Replacement" },
  });
  fireEvent.submit(screen.getByRole("dialog", { name: "New project" }));
  await waitFor(() => expect(flushReject).toBeTruthy());
  expect(
    screen.getByText("Finishing recording before the project transition…"),
  ).toBeTruthy();
  expect(screen.getAllByText(/Clean original/)[0]).toBeTruthy();
  const epoch = Worker.latest.posts.at(-1).epoch;
  act(() =>
    api.receive({
      payload: {
        kind: "command",
        command: {
          type: "patch",
          id: "original-widget",
          screenId: doc.screens[0].id,
          epoch,
          patch: { title: "Stale remote edit" },
        },
      },
    }),
  );
  fireEvent.keyDown(window, { key: "Delete" });
  expect(
    document.querySelector(".canvas .widget .instrument-title")?.textContent,
  ).toBe("Original reading");
  await act(async () => flushReject(new Error("flush disk full")));
  await screen.findAllByText(/Replacement canceled: recording flush failed/);
  expect(screen.getAllByText(/Clean original/)[0]).toBeTruthy();
  expect(document.querySelectorAll(".canvas .widget")).toHaveLength(1);
  expect(
    screen.queryByText("Finishing recording before the project transition…"),
  ).toBeNull();
});

it("Show panel redocks and destroys its existing native floating window", async () => {
  (window as any).__TAURI_INTERNALS__ = {};
  class Worker {
    postMessage() {}
    terminate() {}
    onmessage = null;
    onerror = null;
  }
  class Channel {
    postMessage() {}
    close() {}
    onmessage = null;
  }
  vi.stubGlobal("Worker", Worker);
  vi.stubGlobal("BroadcastChannel", Channel);
  const destroy = vi.fn(async () => {}),
    focus = vi.fn(async () => {});
  api.nativeWindow = { destroy, setFocus: focus };
  localStorage.setItem(
    "olw-layout",
    JSON.stringify(
      setPanelLocation(defaultDockLayout(), "properties", "floating"),
    ),
  );
  vi.spyOn(recoveryApi, "recoveryInvoke").mockImplementation((async (
    c: string,
  ) =>
    c === "recovery_read"
      ? { status: "missing" }
      : 1) as typeof recoveryApi.recoveryInvoke);
  render(<App />);
  await waitFor(() => expect(focus).toHaveBeenCalled());
  fireEvent.click(screen.getByRole("button", { name: "View" }));
  fireEvent.click(screen.getByRole("button", { name: "Show properties" }));
  await waitFor(() => expect(destroy).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("tab", { name: "Properties" })).toBeTruthy();
});

it("native floating actions add on current authority and reject stale or modal edits", async () => {
  (window as any).__TAURI_INTERNALS__ = {};
  class Worker {
    postMessage() {}
    terminate() {}
    onmessage = null;
    onerror = null;
  }
  vi.stubGlobal("Worker", Worker);
  vi.spyOn(recoveryApi, "recoveryInvoke").mockImplementation((async (
    c: string,
  ) =>
    c === "recovery_read"
      ? { status: "missing" }
      : 1) as typeof recoveryApi.recoveryInvoke);
  render(<App />);
  await waitFor(() => expect(api.receive).toBeTypeOf("function"));
  const latest = () =>
    api.emit.mock.calls
      .map((c) => c[1])
      .filter((m) => m?.kind === "snapshot")
      .at(-1).data;
  await waitFor(() => expect(latest()).toBeTruthy());
  const original = latest(),
    screenId = original.workspace.screens[0].id,
    epoch = original.sim.epoch;
  const send = (command: any) =>
    act(() => api.receive({ payload: { kind: "command", command } }));
  send({ type: "add", kind: "numeric", screenId, epoch });
  expect(document.querySelectorAll(".canvas .widget")).toHaveLength(1);
  for (const bad of [
    { kind: "script", epoch },
    { kind: "led", epoch: epoch - 1 },
    { kind: "led" },
    { kind: "led", epoch, screenId: "removed" },
  ])
    send({ type: "add", screenId, ...bad });
  expect(document.querySelectorAll(".canvas .widget")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "+ Screen" }));
  send({ type: "activateScreen", screenId, epoch });
  expect(
    screen.getByRole("tab", { name: "Screen 1" }).getAttribute("aria-selected"),
  ).toBe("true");
  send({ type: "configureSources", screenId, epoch });
  await waitFor(() => expect(api.mainFocus).toHaveBeenCalledTimes(1));
  expect(
    screen.getByRole("dialog", { name: "Configure offline data sources" }),
  ).toBeTruthy();
  send({ type: "add", kind: "led", screenId, epoch });
  expect(document.querySelectorAll(".canvas .widget")).toHaveLength(1);
});
