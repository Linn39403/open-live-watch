import type { Widget, Sim, Workspace, RuntimeFrame } from "./model";
import { qualifiedKey, catalogFor, effectiveRefreshMs } from "./provider";
import { instrumentPalette } from "./colors";
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
  let lastBucket = -1,
    lastSequence = -1;
  const points: (null | { x: number; y: number })[] = [];
  for (const f of frames) {
    if (f.sessionTimeMs < end - g.windowMs) continue;
    const bucket = Math.floor(f.sessionTimeMs / period);
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
    else if (bucket !== lastBucket && bucket > 0) {
      const point = {
        x: g.mode === "xy" ? x * (g.x?.gain ?? 1) + (g.x?.offset ?? 0) : x,
        y: y * b.gain + b.offset,
      };
      points.push(
        Number.isFinite(point.x) && Number.isFinite(point.y) ? point : null,
      );
    }
    lastBucket = bucket;
  }
  return points.slice(-g.capacity);
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
  const points = graphPoints(w, sim.frames ?? [], workspace),
    valid = points.filter((p): p is { x: number; y: number } => p !== null),
    g = w.settings.graph;
  const palette = instrumentPalette(w.settings, "graph");
  let xMin = Math.min(...valid.map((p) => p.x)),
    xMax = Math.max(...valid.map((p) => p.x)),
    yMin =
      g?.autoY === false
        ? (w.settings.min ?? 0)
        : Math.min(...valid.map((p) => p.y)),
    yMax =
      g?.autoY === false
        ? (w.settings.max ?? 100)
        : Math.max(...valid.map((p) => p.y));
  if (!valid.length) {
    xMin = 0;
    xMax = 10;
    if (g?.autoY !== false) {
      yMin = 0;
      yMax = 100;
    }
  }
  if (xMin === xMax) xMax = xMin + 1;
  if (yMin === yMax) yMax = yMin + 1;
  let path = "",
    pen = false;
  for (const p of points) {
    if (!p) {
      pen = false;
      continue;
    }
    const x = 48 + ((p.x - xMin) / (xMax - xMin)) * 288,
      y = 166 - ((p.y - yMin) / (yMax - yMin)) * 138;
    path += (pen ? "L" : "M") + x.toFixed(2) + "," + y.toFixed(2);
    pen = true;
  }
  return (
    <div
      className={
        thumbnail ? "instrument instrument-thumbnail graph" : "instrument graph"
      }
      style={{ "--instrument-color": palette.color } as React.CSSProperties}
    >
      {!thumbnail && <div className="instrument-title">{w.title}</div>}
      <svg
        className="instrument-face graph-face"
        viewBox="0 0 370 220"
        role="img"
        aria-label={w.title + " 2D graph"}
      >
        <defs>
          <clipPath id={"plot-" + w.id}>
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
                  {(yMin + ((yMax - yMin) * i) / 4).toFixed(
                    w.settings.precision ?? 1,
                  )}
                </text>
                <text
                  x={48 + i * 72}
                  y="182"
                  textAnchor="middle"
                  fontSize="9"
                  fill="#52636c"
                >
                  {(xMin + ((xMax - xMin) * i) / 4).toFixed(1)}
                </text>
              </>
            )}
          </g>
        ))}
        <path
          d={
            thumbnail
              ? "M48 125L90 110L130 138L174 72L215 90L260 45L305 61L336 30"
              : path
          }
          fill="none"
          stroke={palette.color}
          strokeWidth="2"
          clipPath={"url(#plot-" + w.id + ")"}
        />
        {!thumbnail && !valid.length && (
          <text
            x="192"
            y="101"
            textAnchor="middle"
            fontSize="13"
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
          • {w.binding?.units || w.binding?.symbolPath || "Y variable"}
        </text>
      </svg>
      {!thumbnail && (
        <div className="binding-label">
          {sim.running
            ? "SIMULATED"
            : valid.length
              ? "Stopped capture"
              : "No acquired data"}{" "}
          • {g?.mode === "xy" ? "XY coherent pairs" : "Time series"} •{" "}
          {g?.autoY === false ? "Manual Y" : "Auto axes"}
        </div>
      )}
    </div>
  );
}
