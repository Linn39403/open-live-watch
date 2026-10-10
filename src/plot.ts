export type PlotPoint = { x: number; y: number };
/** Min/max bucket reduction retains peaks and segment gaps, never joins discarded gaps. */
export function decimatePoints(
  points: (PlotPoint | null)[],
  capacity: number,
  axes: "y" | "xy" = "y",
): (PlotPoint | null)[] {
  if (points.length <= capacity) return points;
  const trailingGap = points.at(-1) === null;
  const target = capacity - (trailingGap ? 1 : 0);
  const segments: PlotPoint[][] = [];
  let current: PlotPoint[] = [];
  for (const point of points) {
    if (point) current.push(point);
    else if (current.length) {
      segments.push(current);
      current = [];
    }
  }
  if (current.length) segments.push(current);
  if (!segments.length) return [];
  const retained = segments.slice(-Math.max(1, Math.floor((target + 1) / 2)));
  const separators = retained.length - 1;
  let remaining = target - separators;
  const total = retained.reduce((n, s) => n + s.length, 0);
  const result: (PlotPoint | null)[] = [];
  retained.forEach((segment, index) => {
    const later = retained.length - index - 1;
    const budget =
      index === retained.length - 1
        ? remaining
        : Math.max(
            1,
            Math.min(
              remaining - later,
              Math.floor(((target - separators) * segment.length) / total),
            ),
          );
    remaining -= budget;
    if (index) result.push(null);
    if (segment.length <= budget) {
      result.push(...segment);
      return;
    }
    if (budget === 1) {
      result.push(segment.at(-1)!);
      return;
    }
    if (budget === 2) {
      result.push(segment[0], segment.at(-1)!);
      return;
    }
    const selected = new Set<number>([0, segment.length - 1]);
    const buckets = Math.max(
      1,
      Math.floor((budget - 2) / (axes === "xy" ? 4 : 2)),
    );
    for (let b = 0; b < buckets; b++) {
      const start = 1 + Math.floor(((segment.length - 2) * b) / buckets),
        end = 1 + Math.floor(((segment.length - 2) * (b + 1)) / buckets);
      let min = start,
        max = start,
        minX = start,
        maxX = start;
      for (let j = start; j < end; j++) {
        if (segment[j].y < segment[min].y) min = j;
        if (segment[j].y > segment[max].y) max = j;
        if (segment[j].x < segment[minX].x) minX = j;
        if (segment[j].x > segment[maxX].x) maxX = j;
      }
      selected.add(min);
      selected.add(max);
      if (axes === "xy") {
        selected.add(minX);
        selected.add(maxX);
      }
    }
    let indices = [...selected].sort((a, b) => a - b);
    if (indices.length > budget) {
      let min = 0,
        max = 0,
        minX = 0,
        maxX = 0;
      for (let j = 1; j < segment.length; j++) {
        if (segment[j].y < segment[min].y) min = j;
        if (segment[j].y > segment[max].y) max = j;
        if (segment[j].x < segment[minX].x) minX = j;
        if (segment[j].x > segment[maxX].x) maxX = j;
      }
      indices = [
        ...new Set(
          axes === "xy"
            ? [minX, maxX, min, max, segment.length - 1]
            : [min, max, segment.length - 1],
        ),
      ]
        .slice(0, budget - 1)
        .concat(segment.length - 1);
      indices = [...new Set(indices)].sort((a, b) => a - b);
    }
    result.push(...indices.map((i) => segment[i]));
  });
  if (trailingGap) result.push(null);
  return result.slice(-capacity);
}
