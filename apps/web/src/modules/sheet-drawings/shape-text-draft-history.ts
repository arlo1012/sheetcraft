/** Private edit history: immutable text, formatting and layout share one undo stream. */
export class ShapeTextDraftHistory<T> {
  private entries: T[];
  private cursor = 0;
  constructor(
    initial: T,
    private readonly key: (value: T) => string,
  ) {
    this.entries = [initial];
  }
  capture(value: T): void {
    this.entries[this.cursor] = value;
  }
  record(value: T): void {
    if (this.key(this.entries[this.cursor]!) === this.key(value)) {
      this.capture(value);
      return;
    }
    this.entries.splice(this.cursor + 1);
    this.entries.push(value);
    this.cursor++;
    // Bound both object count and retained attributed-text bytes.
    let units = this.entries.reduce((sum, entry) => sum + this.key(entry).length, 0);
    while (this.entries.length > 1 && (this.entries.length > 100 || units > 4_000_000)) {
      units -= this.key(this.entries.shift()!).length;
      this.cursor--;
    }
  }
  step(direction: "undo" | "redo"): T | undefined {
    const next = this.cursor + (direction === "undo" ? -1 : 1);
    if (next < 0 || next >= this.entries.length) return;
    this.cursor = next;
    return this.entries[next];
  }
}
