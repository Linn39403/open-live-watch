import type { Widget, Sim, Workspace, RuntimeFrame } from "./model";
import { qualifiedKey, catalogFor, effectiveRefreshMs } from "./provider";
import { instrumentPalette } from "./colors";
import { useId, type CSSProperties } from "react";
import { decimatePoints, type PlotPoint } from "./plot";
export function graphPoints(
  w: Widget,
  frames: RuntimeFrame[],
  workspace: Workspace,
): (null | { x: number; y: number })[] {
  const b = w.binding,
    g = w.settings.graph;
  if (!b || !g) return [];
  const catalog = catalogFor(workspace.sources);
  if (
    !catalog.some(
      (c) =>
        c.sourceId === b.sourceId &&
        c.symbolPath === b.symbolPath &&
        c.type === "number",
    ) ||
    (g.mode === "xy" &&
      !catalog.some(
        (c) =>
          c.sourceId === g.x?.sourceId &&
          c.symbolPath === g.x.symbolPath &&
          c.type === "number",
      ))
  )
    return [];
  const period = effectiveRefreshMs(
    Math.max(b.periodMs, g.mode === "xy" ? (g.x?.periodMs ?? 50) : 50),
  );
  const end = frames.at(-1)?.sessionTimeMs ?? 0;
  const visibleEnd = Math.floor(end / period) * period;
  let lastSequence = -1,
    lastRevision: number | undefined;
  const points: (null | { x: number; y: number })[] = [];
  for (const f of frames) {
    if (f.sessionTimeMs < end - g.windowMs) continue;
    if (f.sessionTimeMs > visibleEnd) continue;
    const yKey = qualifiedKey(b.sourceId, b.symbolPath),
      xKey = g.x && qualifiedKey(g.x.sourceId, g.x.symbolPath);
    const y = f.values[yKey],
      x =
        g.mode === "time"
          ? f.sessionTimeMs / 1000
          : xKey
            ? f.values[xKey]
            : undefined;
    if (lastSequence >= 0 && f.sequence - lastSequence > 1) points.push(null);
    if (
      lastRevision !== undefined &&
      f.commandRevision !== undefined &&
      lastRevision !== f.commandRevision
    )
      points.push(null);
    lastRevision = f.commandRevision;
    lastSequence = f.sequence;
    if (
      f.quality[yKey] !== "good" ||
      (g.mode === "xy" && (!xKey || f.quality[xKey] !== "good")) ||
      typeof x !== "number" ||
      typeof y !== "number" ||
      !Number.isFinite(x) ||
      !Number.isFinite(y)
    )
      points.push(null);
    else {
      const point = {
        x: g.mode === "xy" ? x * (g.x?.gain ?? 1) + (g.x?.offset ?? 0) : x,
        y: y * b.gain + b.offset,
      };
      points.push(
        Number.isFinite(point.x) && Number.isFinite(point.y) ? point : null,
      );
    }
  }
  const latestFrame = frames.at(-1);
  if (
    latestFrame &&
    (latestFrame.quality[qualifiedKey(b.sourceId, b.symbolPath)] !== "good" ||
      (g.mode === "xy" &&
        g.x &&
        latestFrame.quality[qualifiedKey(g.x.sourceId, g.x.symbolPath)] !==
          "good"))
  )
    points.push(null);
  return decimatePoints(points, g.capacity, g.mode === "xy" ? "xy" : "y");
}
export function visibleGraphSeries(w: Widget) {
  const palette = instrumentPalette(w.settings, "graph");
  return [
    {
      id: "primary",
      name: w.settings.graph?.primaryName ?? "Y",
      color: palette.color,
      visible: true,
      binding: w.binding,
    },
    ...(w.settings.graph?.series ?? []),
  ]
    .filter((s) => s.visible)
    .map((s) => ({ ...s, widget: { ...w, binding: s.binding } }));
}
function traceGeometry(
  points: (PlotPoint | null)[],
  axes: { x: Axis; y: Axis },
) {
  let path = "",
    pen = false;
  const markers: { x: number; y: number; first: boolean }[] = [];
  for (const point of points) {
    if (!point) {
      pen = false;
      continue;
    }
    const x = 48 + normalized(point.x, axes.x) * 288,
      y = 166 - normalized(point.y, axes.y) * 138;
    markers.push({ x, y, first: !pen });
    path += (pen ? "L" : "M") + x.toFixed(2) + "," + y.toFixed(2);
    pen = true;
  }
  return {
    path,
    markers,
    latest: points.at(-1),
    latestMarker: points.at(-1) ? markers.at(-1) : undefined,
  };
}
export type Axis = { min: number; max: number };
export function safeAxis(min: number, max: number, pad = false): Axis {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max)
    return { min: 0, max: 100 };
  if (min === max) {
    const margin = Math.max(Math.abs(min) * 0.05, 1);
    return {
      min: Math.max(-Number.MAX_VALUE, min - margin),
      max: Math.min(Number.MAX_VALUE, max + margin),
    };
  }
  if (pad) {
    const span = max - min;
    const margin = Number.isFinite(span) ? span * 0.04 : 0;
    return {
      min: Math.max(-Number.MAX_VALUE, min - margin),
      max: Math.min(Number.MAX_VALUE, max + margin),
    };
  }
  return { min, max };
}
export function normalized(value: number, axis: Axis) {
  const span = axis.max - axis.min;
  const numerator = value - axis.min;
  const fraction =
    Number.isFinite(span) && Number.isFinite(numerator)
      ? numerator / span
      : (value / 2 - axis.min / 2) / (axis.max / 2 - axis.min / 2);
  if (!Number.isFinite(fraction))
    return value < axis.min ? -1000000 : value > axis.max ? 1000000 : 0.5;
  return Number.isFinite(fraction)
    ? Math.max(-1000000, Math.min(1000000, fraction))
    : 0.5;
}
export function axisTick(axis: Axis, t: number) {
  return axis.min * (1 - t) + axis.max * t;
}
function catalogAxis(
  workspace: Workspace,
  binding: Widget["binding"],
): Axis | undefined {
  const c =
    binding &&
    catalogFor(workspace.sources).find(
      (c) =>
        c.sourceId === binding.sourceId &&
        c.symbolPath === binding.symbolPath &&
        c.type === "number",
    );
  if (!binding || !c) return;
  const first = c.min * binding.gain + binding.offset,
    second = c.max * binding.gain + binding.offset;
  if (!Number.isFinite(first) || !Number.isFinite(second)) return;
  return safeAxis(Math.min(first, second), Math.max(first, second));
}
export function graphAxes(
  w: Widget,
  points: (null | { x: number; y: number })[],
  workspace: Workspace,
): { x: Axis; y: Axis } {
  const valid = points.filter((p): p is { x: number; y: number } => p !== null),
    g = w.settings.graph;
  const dataAxis = (key: "x" | "y") =>
    valid.length
      ? safeAxis(
          Math.min(...valid.map((p) => p[key])),
          Math.max(...valid.map((p) => p[key])),
          true,
        )
      : safeAxis(0, 100);
  const catalogRanges = visibleGraphSeries(w)
    .map((s) => catalogAxis(workspace, s.binding))
    .filter((a): a is Axis => !!a);
  return {
    x:
      g?.mode === "xy"
        ? (catalogAxis(workspace, g.x) ?? dataAxis("x"))
        : valid.length
          ? safeAxis(
              Math.min(...valid.map((p) => p.x)),
              Math.max(...valid.map((p) => p.x)),
            )
          : { min: 0, max: 10 },
    y:
      g?.autoY === false
        ? safeAxis(w.settings.min ?? 0, w.settings.max ?? 100)
        : catalogRanges.length
          ? safeAxis(
              Math.min(...catalogRanges.map((a) => a.min)),
              Math.max(...catalogRanges.map((a) => a.max)),
            )
          : dataAxis("y"),
  };
}
function formatTick(value: number, precision = 1) {
  return Math.abs(value) >= 1e6 ||
    (Math.abs(value) > 0 && Math.abs(value) < 0.001)
    ? value.toExponential(1)
    : value.toFixed(precision);
}
export function axisLabel(axis: Axis, t: number, preferred = 1) {
  const step = Math.abs(axis.max / 4 - axis.min / 4),
    value = axisTick(axis, t);
  if (!step || !Number.isFinite(step)) return formatTick(value, preferred);
  const precision = Math.max(
    preferred,
    Math.min(12, Math.max(0, Math.ceil(-Math.log10(step)) + 1)),
  );
  const max = Math.max(Math.abs(axis.min), Math.abs(axis.max));
  if (max >= 1e6 || (max > 0 && max < 0.001))
    return value.toExponential(
      Math.min(
        12,
        Math.max(
          1,
          Math.ceil(Math.log10(max)) - Math.floor(Math.log10(step)) + 1,
        ),
      ),
    );
  return value.toFixed(precision);
}
export function Graph({
  w,
  sim,
  workspace,
  thumbnail = false,
}: {
  w: Widget;
  sim: Sim;
  workspace: Workspace;
  thumbnail?: boolean;
}) {
  const clipId = "plot-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const series = visibleGraphSeries(w).map((series) => ({
    ...series,
    points: graphPoints(series.widget, sim.frames ?? [], workspace),
  }));
  const points = series.flatMap((s) => [null, ...s.points]);
  const valid = points.filter((p): p is PlotPoint => p !== null),
    g = w.settings.graph;
  const axes = graphAxes(w, points, workspace),
    palette = instrumentPalette(w.settings, "graph");
  const traceMode = g?.traceMode ?? (g?.mode === "xy" ? "points" : "line");
  const traces = series.map((s) => ({
    ...s,
    ...traceGeometry(s.points, axes),
  }));
  const latest = traces[0]?.latest;
  const units = [
    ...new Set(series.map((s) => s.binding?.units ?? "").filter(Boolean)),
  ];
  const yUnits =
    units.length > 1
      ? "Mixed units: " + units.join(" / ")
      : (units[0] ?? "Y variable");
  const status = sim.running
    ? "LIVE • simulated"
    : valid.length
      ? "STOPPED • frozen capture"
      : "No acquired data";
  const detail =
    status +
    " • displayed samples; refresh " +
    effectiveRefreshMs(w.binding?.periodMs ?? 50) +
    " ms • " +
    traces
      .map(
        (trace) =>
          trace.name +
          ": " +
          (trace.latest
            ? formatTick(trace.latest.y, w.settings.precision ?? 1)
            : "unavailable") +
          " " +
          (trace.binding?.units ?? ""),
      )
      .join("; ") +
    " • " +
    yUnits;
  const shortUnits = yUnits.length > 42 ? yUnits.slice(0, 39) + "…" : yUnits;
  return (
    <div
      className={
        thumbnail ? "instrument instrument-thumbnail graph" : "instrument graph"
      }
      style={{ "--instrument-color": palette.color } as CSSProperties}
    >
      {!thumbnail && (
        <div className="instrument-title" title={w.title}>
          {w.title}
        </div>
      )}
      <svg
        className="instrument-face graph-face"
        viewBox="0 0 370 220"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={w.title + " 2D graph. " + detail}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x="48" y="28" width="288" height="138" />
          </clipPath>
        </defs>
        <rect
          x="1"
          y="1"
          width="368"
          height="218"
          rx="4"
          fill="#f6f7f4"
          stroke="#8c9ca4"
        />
        <rect
          x="48"
          y="28"
          width="288"
          height="138"
          fill="#fff"
          stroke="#a0adb4"
        />
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <path
              d={`M${48 + i * 72} 28V166M48 ${28 + i * 34.5}H336`}
              stroke="#e3e7e9"
            />
            {!thumbnail && (
              <>
                <text
                  x="42"
                  y={170 - i * 34.5}
                  textAnchor="end"
                  fontSize="9"
                  fill="#52636c"
                >
                  {axisLabel(axes.y, i / 4, w.settings.precision ?? 1)}
                </text>
                <text
                  x={48 + i * 72}
                  y="182"
                  textAnchor="middle"
                  fontSize="9"
                  fill="#52636c"
                >
                  {axisLabel(axes.x, i / 4)}
                </text>
              </>
            )}
          </g>
        ))}
        <g clipPath={"url(#" + clipId + ")"}>
          {thumbnail ? (
            <path
              d="M48 125L90 110L130 138L174 72L215 90L260 45L305 61L336 30"
              fill="none"
              stroke={palette.color}
              strokeWidth="2"
            />
          ) : (
            traces.map((trace, seriesIndex) => (
              <g key={trace.id} aria-label={trace.name + " trace"}>
                {traceMode === "line" && (
                  <path
                    d={trace.path}
                    fill="none"
                    stroke={trace.color}
                    strokeWidth="2"
                    strokeDasharray={
                      seriesIndex % 3 === 1
                        ? "6 3"
                        : seriesIndex % 3 === 2
                          ? "2 3"
                          : undefined
                    }
                  />
                )}
                {trace.markers
                  .filter((p) => traceMode === "points" || p.first)
                  .map((p, i) => (
                    <circle
                      key={i}
                      cx={p.x}
                      cy={p.y}
                      r={traceMode === "points" ? 2 : 2.5}
                      fill={trace.color}
                    />
                  ))}
                {trace.latestMarker && (
                  <circle
                    cx={trace.latestMarker.x}
                    cy={trace.latestMarker.y}
                    r="4"
                    fill={trace.color}
                    stroke="#fff"
                    strokeWidth="1.5"
                  />
                )}
              </g>
            ))
          )}
        </g>
        {!thumbnail && !valid.length && (
          <text
            x="192"
            y="101"
            textAnchor="middle"
            fontSize="12"
            fill="#5f737d"
          >
            {sim.running
              ? "No usable samples"
              : "Configure bindings • Run to acquire"}
          </text>
        )}
        <text x="192" y="204" textAnchor="middle" fontSize="10" fill="#425963">
          {g?.mode === "xy"
            ? g.x?.units || g.x?.symbolPath || "X variable"
            : "Elapsed simulation time (s)"}{" "}
          •{" "}
          <tspan>
            <title>{yUnits}</title>
            {shortUnits}
          </tspan>
        </text>
      </svg>
      {!thumbnail && (
        <>
          <div className="graph-values" title={detail} aria-label={detail}>
            {status}{" "}
            {traces.map((trace, index) => (
              <span
                key={trace.id}
                title={
                  trace.binding?.sourceId + " / " + trace.binding?.symbolPath
                }
                style={{
                  borderBottom:
                    "2px " +
                    (index % 3 === 1
                      ? "dashed"
                      : index % 3 === 2
                        ? "dotted"
                        : "solid") +
                    " " +
                    trace.color,
                }}
              >
                {" "}
                • {trace.name}:{" "}
                {trace.latest
                  ? formatTick(trace.latest.y, w.settings.precision ?? 1)
                  : "—"}{" "}
                {trace.binding?.units}
              </span>
            ))}
            {g?.mode === "xy"
              ? " • X " +
                (latest ? formatTick(latest.x) : "—") +
                " " +
                (g.x?.units ?? "")
              : ""}
          </div>
          <div
            className="binding-label"
            title="Control writes start a new trace segment. Fixed X creates a vertical XY plot."
          >
            {g?.mode === "xy" ? "XY coherent pairs" : "Time series"} •{" "}
            {traceMode === "points" ? "Scatter points" : "Connected trajectory"}{" "}
            • {g?.autoY === false ? "Manual Y" : "Catalog Y scale"}
          </div>
        </>
      )}
    </div>
  );
}
