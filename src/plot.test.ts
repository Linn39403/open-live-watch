import { it, expect } from "vitest";
import { decimatePoints } from "./plot";
it("preserves brief extrema, newest point and quality/command gaps within bounded output", () => {
  const first = Array.from({ length: 300 }, (_, x) => ({
    x,
    y: x === 151 ? 100 : x === 152 ? -100 : 0,
  }));
  const second = Array.from({ length: 300 }, (_, i) => ({
    x: 301 + i,
    y: i === 100 ? 50 : 2,
  }));
  const reduced = decimatePoints([...first, null, ...second], 40);
  expect(reduced.length).toBeLessThanOrEqual(40);
  expect(reduced.some((p) => p?.y === 100)).toBe(true);
  expect(reduced.some((p) => p?.y === -100)).toBe(true);
  expect(reduced).toContain(null);
  expect(reduced.at(-1)).toEqual(second.at(-1));
});
it("many isolated segments remain isolated rather than inventing connected pairs", () => {
  const points = Array.from({ length: 100 }, (_, x) => [
    { x, y: x },
    null,
  ]).flat();
  const reduced = decimatePoints(points, 10);
  expect(reduced.length).toBeLessThanOrEqual(10);
  for (let i = 1; i < reduced.length; i++)
    expect(reduced[i] === null || reduced[i - 1] === null).toBe(true);
  expect(reduced.filter(Boolean).at(-1)).toEqual({ x: 99, y: 99 });
});
it("three-point budgets retain both extrema and final quality gaps remain unavailable", () => {
  expect(
    decimatePoints(
      [
        { x: 0, y: 0 },
        { x: 1, y: -100 },
        { x: 2, y: 100 },
        { x: 3, y: 0 },
      ],
      3,
    ),
  ).toEqual([
    { x: 1, y: -100 },
    { x: 2, y: 100 },
    { x: 3, y: 0 },
  ]);
  const points = [
    ...Array.from({ length: 100 }, (_, x) => ({ x, y: x % 5 })),
    null,
  ];
  expect(decimatePoints(points, 10).at(-1)).toBeNull();
});

it("XY reduction retains X and Y extrema as original coherent pairs, gaps and latest point", () => {
  const points = Array.from({ length: 300 }, (_, i) => ({
    x: i === 77 ? 900 : i === 78 ? -900 : 0,
    y: i === 130 ? 500 : i === 131 ? -500 : 25,
  }));
  const reduced = decimatePoints([...points, null, ...points], 20, "xy");
  expect(reduced.length).toBeLessThanOrEqual(20);
  for (const index of [77, 78, 130, 131])
    expect(reduced).toContain(points[index]);
  expect(reduced).toContain(null);
  expect(reduced.at(-1)).toBe(points.at(-1));
  const bad = decimatePoints([...points, null], 10, "xy");
  expect(bad.at(-1)).toBeNull();
  expect(bad).toContain(points[77]);
  const small = decimatePoints(points, 5, "xy");
  for (const index of [77, 78, 130, 131])
    expect(small).toContain(points[index]);
});
