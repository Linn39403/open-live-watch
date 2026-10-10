import { it, expect } from "vitest";
import { HoldGate } from "./HoldGate";
it("rejects a second hold so its release cannot overwrite the original safety release", () => {
  const gate = new HoldGate();
  gate.begin("a", "screen1", 2);
  expect(() => gate.begin("b", "screen2", 2)).toThrow();
  expect(gate.owns("a", "screen1", 2)).toBe(true);
  gate.release("b", "screen2", 2);
  expect(gate.owns("a", "screen1", 2)).toBe(true);
  gate.release("a", "screen1", 2);
  gate.begin("b", "screen2", 2);
  gate.reset();
  expect(gate.owns("b", "screen2", 2)).toBe(false);
});
