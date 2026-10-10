// @vitest-environment jsdom
import { it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  act,
  cleanup,
} from "@testing-library/react";
import { App } from "./App";
import { createBlankWorkspace, createInstrument, initialSim } from "./model";
import { defaultDockLayout } from "./docking";
import { DockHost } from "./DockHost";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
  localStorage.clear();
});
it("rejects malformed shared dock snapshots atomically without replacing floating properties", () => {
  window.history.replaceState({}, "", "/?panel=properties");
  class Channel {
    static latest: Channel;
    constructor() {
      Channel.latest = this;
    }
    postMessage() {}
    close() {}
    onmessage: any = null;
  }
  vi.stubGlobal("BroadcastChannel", Channel);
  const doc = createBlankWorkspace("Good snapshot");
  const widget = createInstrument("numeric", "chosen");
  widget.title = "Original title";
  doc.screens[0].widgets = [widget];
  render(<App />);
  const snapshot = {
    workspace: doc,
    sim: initialSim(),
    selected: ["chosen"],
    activeScreenId: doc.screens[0].id,
    dockLayout: defaultDockLayout(),
    layout: {},
  };
  act(() =>
    Channel.latest.onmessage({ data: { kind: "snapshot", data: snapshot } }),
  );
  expect(screen.getByDisplayValue("Original title")).toBeTruthy();
  const bad = structuredClone(snapshot);
  bad.workspace.screens[0].widgets[0].title = "Partially replaced title";
  (bad.dockLayout.root as any).ratio = NaN;
  act(() =>
    Channel.latest.onmessage({ data: { kind: "snapshot", data: bad } }),
  );
  expect(screen.getByDisplayValue("Original title")).toBeTruthy();
  expect(screen.queryByDisplayValue("Partially replaced title")).toBeNull();
  expect(screen.getByText(/Rejected invalid session snapshot/)).toBeTruthy();
});
it("symbol drags do not activate panel docking overlays and split cancel restores original ratio", () => {
  let layout = defaultDockLayout();
  const changed = vi.fn();
  const { container } = render(
    <DockHost
      layout={layout}
      onChange={changed}
      canvas={<div>Canvas</div>}
      renderPanel={(panel) => <div>{panel}</div>}
    />,
  );
  fireEvent.dragEnter(container.querySelector(".dock-leaf")!, {
    dataTransfer: { types: ["symbol"], getData: () => "" },
  });
  expect(container.querySelector(".dock-drop-targets")).toBeNull();
  HTMLElement.prototype.setPointerCapture = () => {};
  const divider = screen.getAllByRole("separator")[0];
  fireEvent.pointerDown(divider, { clientX: 100, pointerId: 1 });
  fireEvent.pointerCancel(divider);
  expect(changed).toHaveBeenCalledWith(
    expect.objectContaining({
      root: expect.objectContaining({ ratio: (layout.root as any).ratio }),
    }),
  );
});

it("floating Toolbox and Explorer send screen-qualified current-session actions", () => {
  class Channel {
    static latest: Channel;
    postMessage = vi.fn();
    onmessage: any = null;
    constructor() {
      Channel.latest = this;
    }
    close() {}
  }
  vi.stubGlobal("BroadcastChannel", Channel);
  const workspace = createBlankWorkspace("Floating actions");
  workspace.screens.push({
    ...structuredClone(workspace.screens[0]),
    id: "second",
    name: "Controls",
  });
  const snapshot = {
    workspace,
    sim: initialSim(),
    selected: [],
    activeScreenId: "second",
    dockLayout: defaultDockLayout(),
    layout: {},
  };
  window.history.replaceState({}, "", "/?panel=toolbox");
  const { container } = render(<App />);
  act(() =>
    Channel.latest.onmessage({ data: { kind: "snapshot", data: snapshot } }),
  );
  expect(screen.getByText("Add to Controls")).toBeTruthy();
  const add = container.querySelector(".toolbox button") as HTMLButtonElement;
  expect(add.disabled).toBe(false);
  fireEvent.click(add);
  expect(Channel.latest.postMessage).toHaveBeenCalledWith({
    kind: "command",
    command: {
      type: "add",
      kind: "radial",
      screenId: "second",
      epoch: snapshot.sim.epoch,
    },
  });
  cleanup();
  window.history.replaceState({}, "", "/?panel=explorer");
  render(<App />);
  act(() =>
    Channel.latest.onmessage({ data: { kind: "snapshot", data: snapshot } }),
  );
  fireEvent.click(screen.getByRole("button", { name: /Screen 1/ }));
  expect(Channel.latest.postMessage).toHaveBeenCalledWith({
    kind: "command",
    command: {
      type: "activateScreen",
      screenId: workspace.screens[0].id,
      epoch: snapshot.sim.epoch,
    },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Configure data sources" }),
  );
  expect(Channel.latest.postMessage).toHaveBeenCalledWith({
    kind: "command",
    command: {
      type: "configureSources",
      screenId: "second",
      epoch: snapshot.sim.epoch,
    },
  });
});
