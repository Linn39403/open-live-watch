import { it, expect, vi, afterEach } from "vitest";
import {
  Recorder,
  csvCell,
  encodeCsvText,
  decodeCsvText,
  frameCsv,
  historyCsv,
  type LogFrame,
} from "./recording";
import { newRuntime, catalogFor, qualifiedKey } from "./provider";
import type { Source } from "./model";
const sources: Source[] = [
  {
    id: "lab",
    provider: "offline",
    path: "inline",
    variables: [
      {
        id: "n",
        type: "number",
        units: "V",
        initial: 0,
        min: -100,
        max: 100,
        writable: true,
        waveform: "constant",
        periodMs: 1000,
      },
    ],
  },
];
const catalog = catalogFor(sources);
const frame = (sequence = 1, reason?: string): LogFrame => ({
  sequence,
  timeMs: sequence * 50,
  hostReceivedAtUtc: "2026-10-10T08:00:00.000Z",
  samples: [
    {
      sourceId: "lab",
      symbolPath: "n",
      type: "number",
      value: reason ? null : -1.23456789012345,
      quality: reason ? "unresolved" : "good",
      ...(reason ? { reason } : {}),
    },
  ],
});
afterEach(() => vi.useRealTimers());
it("reversibly encodes formula and apostrophe metadata with exact Unicode/quoting and raw numeric precision", () => {
  for (const value of [
    "=SUM(A1)",
    "+1",
    "-1",
    "@x",
    "'hello",
    "\t'hello",
    "\u0085=x",
    "\ufeff=x",
    "\t =x",
    '日本語,"quoted"\nnext',
  ])
    expect(decodeCsvText(encodeCsvText(value))).toBe(value);
  expect(csvCell(-1.23456789012345)).toBe("-1.23456789012345");
  expect(csvCell('a"b\n')).toBe('"a""b\n"');
  expect(frameCsv(frame(1, "=bad"), catalog, 7, 2)).toContain(
    '"spreadsheet-safe-v1",1,7,2,1,50',
  );
});
it("drains accepted frames on Stop once and does not invent host UTC for legacy history", async () => {
  const chunks: LogFrame[][] = [];
  const finish = vi.fn(async () => {});
  const r = new Recorder(
    {
      append: async (f) => {
        chunks.push(f);
      },
      finish,
    },
    () => {},
    catalog,
    7,
    2,
  );
  r.append(frame());
  r.append(frame(2));
  await r.stop();
  await r.stop();
  expect(chunks.flat().map((f) => f.sequence)).toEqual([1, 2]);
  expect(finish).toHaveBeenCalledTimes(1);
  const sim = newRuntime(sources, 8, 2, false),
    key = qualifiedKey("lab", "n");
  sim.frames = [
    {
      epoch: 7,
      catalogRevision: 2,
      sequence: 1,
      sessionTimeMs: 50,
      values: { [key]: 5 },
      quality: { [key]: "good" },
    },
  ];
  expect(historyCsv(sim, catalog)).toContain(
    '"spreadsheet-safe-v1",1,7,2,1,50,""',
  );
});
it("limits actual serialized CSV bytes and drains admitted queue after overload", async () => {
  let release!: () => void;
  const chunks: LogFrame[][] = [];
  const r = new Recorder(
    {
      append: async (f) => {
        chunks.push(f);
        if (chunks.length === 1)
          await new Promise<void>((resolve) => (release = resolve));
      },
      finish: async () => {},
    },
    () => {},
    catalog,
    1,
    1,
  );
  r.append(frame());
  await Promise.resolve();
  r.append(frame(2));
  r.append(frame(3, '"'.repeat(100000)));
  release();
  await expect(r.stop()).rejects.toThrow("admission");
  expect(chunks.flat().map((f) => f.sequence)).toEqual([1, 2]);
  expect(r.queuedBytes).toBe(0);
});
it("bounds unknown append and finish outcomes without retry", async () => {
  vi.useFakeTimers();
  const append = vi.fn(() => new Promise<void>(() => {})),
    finish = vi.fn(() => new Promise<void>(() => {})),
    notify = vi.fn();
  const r = new Recorder({ append, finish }, notify, catalog, 1, 1, 10);
  r.append(frame());
  const stopped = r.stop();
  const rejection = expect(stopped).rejects.toThrow("flush outcome unknown");
  await vi.advanceTimersByTimeAsync(25);
  await rejection;
  expect(append).toHaveBeenCalledTimes(1);
  expect(finish).toHaveBeenCalledTimes(1);
  expect(notify).toHaveBeenCalledWith(
    expect.stringContaining("outcome unknown"),
  );
});
it("makes sink failure visible and rejects unflushed stop", async () => {
  const notify = vi.fn(),
    append = vi.fn(async () => {
      throw new Error("disk full");
    }),
    finish = vi.fn(async () => {});
  const r = new Recorder({ append, finish }, notify, catalog, 1, 1);
  r.append(frame());
  r.append(frame(2));
  await expect(r.stop()).rejects.toThrow("disk full");
  expect(append).toHaveBeenCalledTimes(1);
  expect(notify).toHaveBeenCalledWith("Recording failed: disk full");
  expect(r.queuedBytes).toBe(0);
});
