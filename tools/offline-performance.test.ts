import { it, expect } from "vitest";
import { writeFileSync } from "node:fs";
import { cpus, platform, release, totalmem } from "node:os";
import fixture from "../examples/performance-200.olw.json";
import { parseWorkspace } from "../src/model";
import { newRuntime, stepRuntime } from "../src/provider";
const run = process.env.OLW_PERFORMANCE === "1" ? it : it.skip;
run(
  "accelerated hour-equivalent bounded offline model (not actual GUI duration)",
  async () => {
    const workspace = parseWorkspace(fixture);
    let state = newRuntime(workspace.sources, 1, 1, true),
      maxFrames = 0,
      maxRss = process.memoryUsage().rss;
    const costs: number[] = [];
    const started = performance.now();
    for (let i = 0; i < 72000; i++) {
      const t = performance.now();
      state = stepRuntime(state, workspace.sources);
      const cost = performance.now() - t;
      if (i % 30 === 0) costs.push(cost);
      maxFrames = Math.max(maxFrames, state.frames!.length);
      if (i % 1000 === 0) {
        maxRss = Math.max(maxRss, process.memoryUsage().rss);
        await new Promise((resolve) => setImmediate(resolve));
      }
    }
    expect(state.tick).toBe(72000);
    expect(maxFrames).toBe(600);
    expect(Object.keys(state.frames!.at(-1)!.values)).toHaveLength(100);
    expect(state.frames!.at(-1)!.sessionTimeMs).toBe(3600000);
    costs.sort((a, b) => a - b);
    const report = {
      kind: "accelerated-model-only",
      actualWallSeconds: (performance.now() - started) / 1000,
      simulatedSeconds: 3600,
      ticks: 72000,
      variables: 100,
      fixtureWidgets: 200,
      maxRetainedFrames: maxFrames,
      sampledStepMedianMs: costs[Math.floor(costs.length * 0.5)],
      sampledStepP95Ms: costs[Math.floor(costs.length * 0.95)],
      maxObservedProcessRssMiB: maxRss / 1048576,
      environment: {
        platform: platform(),
        release: release(),
        node: process.version,
        cpu: cpus()[0].model,
        logicalCpus: cpus().length,
        totalMemoryGiB: totalmem() / 1073741824,
      },
      limits:
        "Does not establish actual one-hour GUI/native stability or hardware performance",
    };
    writeFileSync(
      "../offline-model-benchmark.json",
      JSON.stringify(report, null, 2) + "\n",
    );
  },
  120000,
);
