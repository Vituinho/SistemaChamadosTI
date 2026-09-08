// Audio is enabled by a click so browsers can allow it in this tab.
export class NotificationSound {
  private context?: AudioContext;

  async enable() {
    this.context ??= new AudioContext();
    await this.context.resume();
    if (this.context.state !== "running") throw new Error("Áudio indisponível");
    this.play();
  }

  play() {
    const context = this.context;
    if (!context || context.state !== "running") return;
    for (const [index, frequency] of [660, 880, 660].entries()) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime + index * 0.22;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.15, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.2);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(start);
      oscillator.stop(start + 0.21);
    }
  }

  dispose() {
    void this.context?.close().catch(() => {});
    this.context = undefined;
  }
}
