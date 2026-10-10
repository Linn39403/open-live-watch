import { it, expect } from "vitest";
import { createBlankWorkspace } from "./model";
import { parseRecovery } from "./recovery";
it("validates recovery metadata and complete project before any restore", () => {
  const good = {
    formatVersion: 1,
    generation: 2,
    revision: 4,
    savedPath: null,
    workspace: createBlankWorkspace(),
  };
  expect(parseRecovery(good).workspace.sources).toEqual([]);
  for (const patch of [
    { formatVersion: 2 },
    { revision: NaN },
    { generation: -1 },
    { savedPath: 4 },
    { workspace: { schemaVersion: 2 } },
  ])
    expect(() => parseRecovery({ ...good, ...patch })).toThrow();
});
