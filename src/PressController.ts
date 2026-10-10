export type PressMode = "momentary" | "repeat";
/** At most one timer. Cancel never sends a command into a replaced/stopped session. */
export class PressController {
  private timer: ReturnType<typeof setInterval> | null = null;
  private active = false;
  private value = false;
  constructor(
    private emit: (
      value: boolean,
      safetyRelease: boolean,
      finalRelease: boolean,
    ) => void,
  ) {}
  begin(mode: PressMode, periodMs: number) {
    if (this.active) return;
    this.active = true;
    this.value = true;
    this.emit(true, false, false);
    if (mode === "repeat")
      this.timer = setInterval(
        () => {
          this.value = !this.value;
          this.emit(this.value, !this.value, false);
        },
        Math.max(200, Math.min(5000, periodMs)),
      );
  }
  release() {
    if (!this.active) return;
    this.cancel();
    this.emit(false, true, true);
  }
  cancel() {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.active = false;
    this.value = false;
  }
}
