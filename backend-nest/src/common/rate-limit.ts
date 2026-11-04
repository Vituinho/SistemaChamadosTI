/** Bounded in-memory sliding-window counter (process-local; run a single API instance). */
export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly maxKeys = 10_000,
    private readonly now: () => number = Date.now,
  ) {}

  /** Records a hit and returns true, or returns false when the key is over its budget. */
  tryConsume(key: string): boolean {
    const time = this.now();
    const cutoff = time - this.windowMs;
    for (const [stored, values] of this.hits) {
      const first = values.findIndex(value => value > cutoff);
      if (first === -1) this.hits.delete(stored);
      else if (first > 0) values.splice(0, first);
    }
    const values = this.hits.get(key) ?? [];
    if (values.length >= this.max) return false;
    if (!this.hits.has(key) && this.hits.size >= this.maxKeys) return false;
    values.push(time);
    this.hits.set(key, values);
    return true;
  }
}
