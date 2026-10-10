/** One authority-owned hold keeps the deferred release bounded and unambiguous. */
export class HoldGate {
  private held: { id: string; screenId: string; epoch: number } | null = null;
  begin(id: string, screenId: string, epoch: number) {
    if (this.held && !this.owns(id, screenId, epoch))
      throw new Error("Release the previous held control first");
    this.held = { id, screenId, epoch };
  }
  owns(id: string, screenId: string, epoch: number) {
    return (
      this.held?.id === id &&
      this.held.screenId === screenId &&
      this.held.epoch === epoch
    );
  }
  release(id: string, screenId: string, epoch: number) {
    if (this.owns(id, screenId, epoch)) this.held = null;
  }
  reset() {
    this.held = null;
  }
}
