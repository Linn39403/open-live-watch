import { useEffect, useRef, useState } from "react";
import type { Sim, Workspace } from "./model";
export type PerformanceMetrics = {
  processingMs: number[];
  commitMs: number[];
  receivedAt: number;
  lastTick: number;
};
export const boundedMetric = (samples: number[], value: number) => {
  samples.push(value);
  if (samples.length > 2400) samples.shift();
};
function percentile(samples: number[], q: number) {
  if (!samples.length) return "—";
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[
    Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))
  ].toFixed(2);
}
export function Diagnostics({
  sim,
  workspace,
  metrics,
  queueBytes,
}: {
  sim: Sim;
  workspace: Workspace;
  metrics: PerformanceMetrics;
  queueBytes: number;
}) {
  const rafSamples = useRef<number[]>([]),
    response = useRef<number[]>([]),
    [readout, setReadout] = useState(
      "Collecting visible-window renderer timings…",
    );
  const identity = useRef({ epoch: sim.epoch, start: performance.now() });
  if (identity.current.epoch !== sim.epoch) {
    identity.current = { epoch: sim.epoch, start: performance.now() };
    rafSamples.current = [];
    response.current = [];
    metrics.processingMs = [];
    metrics.commitMs = [];
  }
  const latest = useRef({ sim, workspace, queueBytes });
  latest.current = { sim, workspace, queueBytes };
  useEffect(() => {
    let last = performance.now(),
      handle = 0;
    const frame = (now: number) => {
      if (!document.hidden) boundedMetric(rafSamples.current, now - last);
      last = now;
      handle = requestAnimationFrame(frame);
    };
    handle = requestAnimationFrame(frame);
    const timer = setInterval(() => {
      const { sim, workspace, queueBytes } = latest.current;
      const memory = (performance as any).memory;
      setReadout(
        `Run elapsed simulation: ${((sim.frames?.at(-1)?.sessionTimeMs ?? 0) / 1000).toFixed(1)} s; visible measurement: ${((performance.now() - identity.current.start) / 1000).toFixed(1)} s\nWidgets: ${workspace.screens.reduce((n, s) => n + s.widgets.length, 0)}; variables: ${workspace.sources.reduce((n, s) => n + (s.variables?.length ?? (s.provider === "mock" ? 4 : 0)), 0)}; retained frames: ${sim.frames?.length ?? 0}/600; log queue: ${queueBytes}/2097152 bytes\nrAF interval median/p95: ${percentile(rafSamples.current, 0.5)} / ${percentile(rafSamples.current, 0.95)} ms (${rafSamples.current.length} samples, max2400)\nSample processing median/p95: ${percentile(metrics.processingMs, 0.5)} / ${percentile(metrics.processingMs, 0.95)} ms\nSample arrival→React commit median/p95: ${percentile(metrics.commitMs, 0.5)} / ${percentile(metrics.commitMs, 0.95)} ms\nResponse handler→next rAF median/p95: ${percentile(response.current, 0.5)} / ${percentile(response.current, 0.95)} ms\nJS heap: ${memory ? `${(memory.usedJSHeapSize / 1048576).toFixed(1)} MiB / ${(memory.totalJSHeapSize / 1048576).toFixed(1)} MiB` : "unavailable in this WebView"}\nTimings describe this visible window, not hardware acquisition or a one-hour runtime proof. Handler→rAF excludes input queue delay and does not measure completed paint.`,
      );
    }, 1000);
    return () => {
      cancelAnimationFrame(handle);
      clearInterval(timer);
    };
  }, [metrics]);
  return (
    <aside
      className="diagnostics"
      aria-label="Read-only performance diagnostics"
    >
      <strong>Performance diagnostics</strong>
      <pre>{readout}</pre>
      <button
        onClick={() => {
          const start = performance.now();
          requestAnimationFrame(() =>
            boundedMetric(response.current, performance.now() - start),
          );
        }}
      >
        Measure response
      </button>
    </aside>
  );
}
