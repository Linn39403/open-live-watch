import { writeFileSync } from "node:fs";
const variables = Array.from({ length: 100 }, (_, i) => ({
  id: `signal-${i + 1}`,
  type: "number",
  units: "V",
  initial: 50,
  min: 0,
  max: 100,
  writable: i === 0,
  waveform: i === 0 ? "constant" : i % 2 ? "sine" : "ramp",
  periodMs: 1000 + (i % 20) * 100,
}));
const binding = (i) => ({
  sourceId: "performance",
  symbolPath: variables[i % 100].id,
  gain: 1,
  offset: 0,
  units: "V",
  periodMs: 50,
  writable: false,
});
const graphs = Array.from({ length: 4 }, (_, i) => ({
  id: `graph-${i + 1}`,
  kind: "graph",
  title: `Performance graph ${i + 1}`,
  rect: { x: 16 + i * 490, y: 16, width: 470, height: 280, rotation: 0 },
  binding: binding(i + 1),
  settings: {
    min: 0,
    max: 100,
    precision: 1,
    graph: {
      mode: "time",
      capacity: 600,
      windowMs: 30000,
      autoY: true,
      traceMode: "line",
    },
  },
}));
const widgets = [
  ...graphs,
  ...Array.from({ length: 196 }, (_, i) => ({
    id: `numeric-${i + 1}`,
    kind: "numeric",
    title: `Signal ${(i % 100) + 1}`,
    rect: {
      x: 16 + (i % 14) * 140,
      y: 320 + Math.floor(i / 14) * 110,
      width: 130,
      height: 100,
      rotation: 0,
    },
    binding: binding(i),
    settings: { min: 0, max: 100, precision: 1 },
  })),
];
const workspace = {
  schemaVersion: 1,
  id: "performance-200",
  name: "Offline performance: 200 widgets / 100 variables",
  sources: [
    { id: "performance", provider: "offline", path: "inline", variables },
  ],
  screens: [
    {
      id: "performance-screen",
      name: "Performance",
      kind: "dashboard",
      canvas: { width: 2048, height: 2048, grid: 16 },
      widgets,
    },
  ],
};
writeFileSync(
  new URL("../examples/performance-200.olw.json", import.meta.url),
  JSON.stringify(workspace, null, 2) + "\n",
);
if (process.argv[2])
  writeFileSync(process.argv[2], JSON.stringify(workspace, null, 2) + "\n");
