// @vitest-environment jsdom
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import {
  render,
  fireEvent,
  screen,
  cleanup,
  waitFor,
  act,
} from "@testing-library/react";
import { App } from "./App";
import * as recoveryApi from "./recovery";
import { createBlankWorkspace, createInstrument } from "./model";
import { OfflineEngine } from "./engine";
class MockWorker {
  postMessage() {}
  terminate() {}
  onmessage = null;
  onerror = null;
}
class MockChannel {
  static latest: MockChannel;
  constructor() {
    MockChannel.latest = this;
  }
  postMessage() {}
  close() {}
  onmessage = null;
}
beforeEach(() => {
  vi.stubGlobal("Worker", MockWorker);
  vi.stubGlobal("BroadcastChannel", MockChannel);
  HTMLElement.prototype.scrollTo = () => {};
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it("keeps close protection on repeated recovery failure and clears before a successful retry", async () => {
  let clearAttempts = 0;
  const recovery = vi
    .spyOn(recoveryApi, "recoveryInvoke")
    .mockImplementation((async (command: string) => {
      if (command === "recovery_read") return { status: "missing" };
      if (command === "recovery_begin") return 1;
      if (command === "recovery_clear" && ++clearAttempts <= 2)
        throw new Error("disk unavailable " + clearAttempts);
      return undefined;
    }) as typeof recoveryApi.recoveryInvoke);
  render(<App />);
  await waitFor(() =>
    expect(recovery).toHaveBeenCalledWith("recovery_begin", {
      replaceExisting: false,
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: /^Linear gauge:/ }));
  fireEvent.click(screen.getByRole("button", { name: "Close project window" }));
  fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
  await waitFor(() =>
    expect(
      screen.getByRole("dialog", { name: "Unsaved project" }),
    ).toBeTruthy(),
  );
  await screen.findAllByText(/Close failed:.*disk unavailable/);
  expect(document.querySelectorAll(".canvas .widget")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
  await screen.findAllByText(/Close failed:.*disk unavailable 2/);
  expect(screen.getByRole("dialog", { name: "Unsaved project" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
  await screen.findByText("Close confirmed. You can close this browser tab.");
  expect(clearAttempts).toBe(3);
  expect(screen.queryByRole("dialog", { name: "Unsaved project" })).toBeNull();
});
it("queues a held control release across a screen switch until the press acknowledgement", async () => {
  class DelayedWorker {
    static latest: DelayedWorker;
    engine = new OfflineEngine();
    posts: any[] = [];
    results: any[] = [];
    onmessage: ((e: any) => void) | null = null;
    onerror = null;
    constructor() {
      DelayedWorker.latest = this;
    }
    postMessage(m: any) {
      this.posts.push(m);
      const result = this.engine.receive(m);
      if (m.kind === "write") this.results.push(...result);
    }
    terminate() {}
  }
  vi.stubGlobal("Worker", DelayedWorker);
  HTMLElement.prototype.setPointerCapture = () => {};
  const doc = createBlankWorkspace("Hold regression");
  doc.sources = [
    {
      id: "lab",
      provider: "offline",
      path: "inline",
      variables: [
        {
          id: "signal",
          type: "boolean",
          units: "",
          initial: false,
          min: 0,
          max: 1,
          writable: true,
          waveform: "constant",
          periodMs: 1000,
        },
      ],
    },
  ];
  const button = createInstrument("button", "hold-button");
  button.title = "Hold signal";
  button.binding = {
    sourceId: "lab",
    symbolPath: "signal",
    gain: 1,
    offset: 0,
    units: "",
    periodMs: 50,
    writable: true,
  };
  button.settings.buttonMode = "repeat";
  button.settings.repeatMs = 500;
  doc.sources[0].variables!.push({
    ...doc.sources[0].variables![0],
    id: "other",
    initial: true,
  });
  const other = createInstrument("switch", "other-switch");
  other.title = "Other switch";
  other.binding = { ...button.binding, symbolPath: "other" };
  const secondHold = createInstrument("button", "second-hold");
  secondHold.title = "Second hold";
  secondHold.binding = { ...button.binding, symbolPath: "other" };
  doc.screens[0].widgets = [button, other, secondHold];
  doc.screens.push({
    ...structuredClone(doc.screens[0]),
    id: "second",
    name: "Other screen",
    widgets: [],
  });
  localStorage.setItem(
    "olw-recovery-v1",
    JSON.stringify({
      formatVersion: 1,
      generation: 0,
      revision: 1,
      savedPath: null,
      workspace: doc,
    }),
  );
  render(<App />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Restore project" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "▶ Run" }));
  fireEvent.pointerDown(screen.getByRole("button", { name: "Hold signal" }), {
    pointerId: 1,
  });
  const worker = DelayedWorker.latest;
  expect(worker.posts.filter((m) => m.kind === "write")).toHaveLength(1);
  fireEvent.click(screen.getByRole("tab", { name: "Other screen" }));
  expect(worker.posts.filter((m) => m.kind === "write")).toHaveLength(1);
  await act(async () => {
    worker.onmessage?.({ data: worker.results[0] });
    await Promise.resolve();
  });
  const writes = worker.posts.filter((m) => m.kind === "write");
  expect(writes.map((m) => m.value)).toEqual([true, false]);
  expect(writes[1].epoch).toBe(writes[0].epoch);
  await act(async () => {
    worker.onmessage?.({ data: worker.results[1] });
    await Promise.resolve();
  });
  fireEvent.click(screen.getByRole("tab", { name: "Screen 1" }));
  vi.useFakeTimers();
  const acknowledge = async (index: number) => {
    await act(async () => {
      worker.onmessage?.({ data: worker.results[index] });
      await Promise.resolve();
    });
  };
  fireEvent.pointerDown(screen.getByRole("button", { name: "Hold signal" }), {
    pointerId: 2,
  });
  await acknowledge(2);
  fireEvent.click(screen.getByRole("button", { name: "Other switch" }));
  await acknowledge(3);
  act(() => vi.advanceTimersByTime(500));
  await acknowledge(4);
  const count = worker.posts.filter((m) => m.kind === "write").length;
  act(() => {
    (MockChannel.latest.onmessage as any)?.({
      data: {
        kind: "command",
        command: {
          type: "write",
          id: "second-hold",
          screenId: doc.screens[0].id,
          epoch: worker.engine.state.epoch,
          value: true,
        },
      },
    });
  });
  expect(worker.posts.filter((m) => m.kind === "write")).toHaveLength(count);
  fireEvent.pointerUp(screen.getByRole("button", { name: "Hold signal" }), {
    pointerId: 2,
  });
  expect(worker.posts.filter((m) => m.kind === "write").at(-1)).toMatchObject({
    symbolPath: "signal",
    value: false,
  });
  expect(worker.posts.filter((m) => m.kind === "write")).toHaveLength(
    count + 1,
  );
  await acknowledge(5);
  fireEvent.pointerDown(screen.getByRole("button", { name: "Hold signal" }), {
    pointerId: 4,
  });
  fireEvent.pointerUp(screen.getByRole("button", { name: "Hold signal" }), {
    pointerId: 4,
  });
  const beforeUnknown = worker.posts.filter((m) => m.kind === "write").length;
  await act(async () => {
    const ack = worker.results[6];
    worker.onmessage?.({
      data: {
        ...ack,
        status: "unknown",
        commandRevision: ack.commandRevision - 1,
        value: null,
        reason: "uncertain",
      },
    });
    await Promise.resolve();
  });
  act(() => vi.advanceTimersByTime(5000));
  expect(worker.posts.filter((m) => m.kind === "write")).toHaveLength(
    beforeUnknown,
  );
  expect(screen.getByRole("button", { name: "▶ Run" })).toBeTruthy();
  expect(screen.getByRole("alert").textContent).toContain(
    "Write outcome unknown",
  );
});
it("copies on Screen1, creates and renames Screen2, then pastes without reverting either screen", () => {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: /^Linear gauge:/ }));
  fireEvent.click(screen.getByRole("button", { name: "Copy" }));
  fireEvent.click(screen.getByRole("button", { name: "+ Screen" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Screen name" }), {
    target: { value: "Controls" },
  });
  expect(screen.getByRole("tab", { name: "Controls" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Paste" }));
  expect(
    screen.getByRole("tab", { name: "Controls" }).getAttribute("aria-selected"),
  ).toBe("true");
  expect(
    document.querySelectorAll('[aria-label="Project screens"] [role="tab"]'),
  ).toHaveLength(2);
  expect(document.querySelectorAll(".canvas .widget")).toHaveLength(1);
  fireEvent.click(screen.getByRole("tab", { name: "Screen 1" }));
  expect(document.querySelectorAll(".canvas .widget")).toHaveLength(1);
});
it("asks before closing a dirty project and Cancel preserves the document", () => {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: /^Linear gauge:/ }));
  fireEvent.click(screen.getByRole("button", { name: "Close project window" }));
  expect(screen.getByRole("dialog", { name: "Unsaved project" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog", { name: "Unsaved project" })).toBeNull();
  expect(document.querySelectorAll(".canvas .widget")).toHaveLength(1);
});

it("dock separator keyboard resizing never nudges selected instrument or edits document history", () => {
  const { container } = render(<App />);
  fireEvent.click(screen.getByRole("button", { name: /^Linear gauge:/ }));
  const x = screen.getByLabelText("x") as HTMLInputElement;
  const original = x.value;
  const divider = screen.getAllByRole("separator")[0];
  const ratio = Number(divider.getAttribute("aria-valuenow"));
  divider.focus();
  fireEvent.keyDown(divider, { key: "ArrowRight" });
  expect(
    Number(screen.getAllByRole("separator")[0].getAttribute("aria-valuenow")),
  ).toBeGreaterThan(ratio);
  expect((screen.getByLabelText("x") as HTMLInputElement).value).toBe(original);
  fireEvent.click(screen.getByRole("button", { name: /Undo/ }));
  expect(screen.queryByLabelText("x")).toBeNull();
});
