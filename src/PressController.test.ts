import { it, expect, vi, afterEach } from "vitest";
import { PressController } from "./PressController";
afterEach(() => vi.useRealTimers());
it("emits one press/release and cancels repeat without replay across sessions", () => {
  vi.useFakeTimers();
  const emit = vi.fn(),
    control = new PressController(emit);
  control.begin("momentary", 500);
  control.begin("momentary", 500);
  control.release();
  control.release();
  expect(emit.mock.calls).toEqual([
    [true, false, false],
    [false, true, true],
  ]);
  emit.mockClear();
  control.begin("repeat", 200);
  vi.advanceTimersByTime(400);
  expect(emit.mock.calls).toEqual([
    [true, false, false],
    [false, true, false],
    [true, false, false],
  ]);
  control.cancel();
  vi.advanceTimersByTime(5000);
  expect(emit).toHaveBeenCalledTimes(3);
});
