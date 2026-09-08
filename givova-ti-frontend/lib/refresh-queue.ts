// Keep at most one request running and one pending update with the newest filters.
export class RefreshQueue {
  private running = false;
  private pending?: () => Promise<void>;

  async run(task: () => Promise<void>) {
    this.pending = task;
    if (this.running) return;
    this.running = true;
    try {
      while (this.pending) {
        const next = this.pending;
        this.pending = undefined;
        await next();
      }
    } finally {
      this.running = false;
    }
  }

  cancelPending() {
    this.pending = undefined;
  }
}
