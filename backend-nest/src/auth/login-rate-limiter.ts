/**
 * In-memory sliding-window limiter for login attempts.
 *
 * Two buckets: ip+username (protects one account) and ip (slows password
 * spraying). Behind the cPanel PHP proxy every employee shares the proxy IP,
 * so the per-IP budget is intentionally larger. A successful login clears the
 * ip+username bucket. Process-local: run a single API instance (Render).
 */
export class LoginRateLimiter {
  private readonly buckets = new Map<string, number[]>();

  constructor(
    private readonly maxPerAccount: number,
    private readonly maxPerIp: number,
    private readonly windowMs: number,
    private readonly maxKeys = 10_000,
    private readonly now: () => number = Date.now,
  ) {}

  /** Returns false when the attempt must be refused; otherwise records it. */
  tryConsume(ip: string, username: string): boolean {
    const time = this.now();
    this.prune(time);
    const accountKey = `a:${ip}:${username}`;
    const ipKey = `i:${ip}`;
    const account = this.buckets.get(accountKey) ?? [];
    const perIp = this.buckets.get(ipKey) ?? [];
    if (account.length >= this.maxPerAccount || perIp.length >= this.maxPerIp) return false;
    if (this.buckets.size >= this.maxKeys && (!this.buckets.has(accountKey) || !this.buckets.has(ipKey))) return false;
    account.push(time);
    perIp.push(time);
    this.buckets.set(accountKey, account);
    this.buckets.set(ipKey, perIp);
    return true;
  }

  reset(ip: string, username: string) {
    this.buckets.delete(`a:${ip}:${username}`);
  }

  private prune(time: number) {
    const cutoff = time - this.windowMs;
    for (const [key, values] of this.buckets) {
      const first = values.findIndex(value => value > cutoff);
      if (first === -1) this.buckets.delete(key);
      else if (first > 0) values.splice(0, first);
    }
  }
}
