import { api } from "@/lib/api/endpoints";

/* ---------- Web Push (works with the panel closed) ---------- */

export type PushState = "unsupported" | "server-disabled" | "denied" | "off" | "on";

export function supportsPush() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function applicationServerKey(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), character => character.charCodeAt(0));
}

function sameKey(current: ArrayBuffer | null, expected: Uint8Array) {
  if (!current) return false;
  const bytes = new Uint8Array(current);
  return bytes.length === expected.length && bytes.every((value, index) => value === expected[index]);
}

function body(subscription: PushSubscription) {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error("O navegador não forneceu uma assinatura completa.");
  return { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } };
}

async function registration() {
  await navigator.serviceWorker.register("/push-sw.js", { scope: "/" });
  return navigator.serviceWorker.ready;
}

/** Reports the current state and re-registers an existing subscription with the API (keeps it linked to this technician). */
export async function restorePush(): Promise<PushState> {
  if (!supportsPush()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const worker = await registration();
  const subscription = await worker.pushManager.getSubscription();
  if (!subscription) return "off";
  await api.pushSubscribe(body(subscription));
  return "on";
}

export async function enablePush(): Promise<PushState> {
  if (!supportsPush()) throw new Error("Este navegador não oferece notificações em segundo plano.");
  // The permission prompt must start inside the click handler.
  const permissionRequest = Notification.requestPermission();
  const [permission, worker, config] = await Promise.all([permissionRequest, registration(), api.pushConfig()]);
  if (permission !== "granted") throw new Error("Permissão recusada. Libere as notificações deste site nas configurações do navegador.");
  if (!config.enabled || !config.public_key) throw new Error("O servidor ainda não possui as chaves de notificação (VAPID).");
  const expected = applicationServerKey(config.public_key);
  let subscription = await worker.pushManager.getSubscription();
  if (subscription && !sameKey(subscription.options.applicationServerKey, expected)) {
    await subscription.unsubscribe();
    subscription = null;
  }
  subscription ??= await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: expected });
  await api.pushSubscribe(body(subscription));
  return "on";
}

export async function disablePush(): Promise<PushState> {
  if (!supportsPush()) return "unsupported";
  const worker = await registration();
  const subscription = await worker.pushManager.getSubscription();
  if (subscription) {
    try {
      await api.pushUnsubscribe(subscription.endpoint);
    } finally {
      await subscription.unsubscribe();
    }
  }
  return "off";
}

/* ---------- In-tab sound (requires a click to unlock audio) ---------- */

export class NotificationSound {
  private context?: AudioContext;

  get ready() {
    return this.context?.state === "running";
  }

  async enable() {
    this.context ??= new AudioContext();
    await this.context.resume();
    if (this.context.state !== "running") throw new Error("O navegador não liberou o som.");
  }

  play() {
    const context = this.context;
    if (!context || context.state !== "running") return;
    for (const [index, frequency] of [660, 880, 660].entries()) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime + index * 0.2;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.14, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.18);
      oscillator.connect(gain).connect(context.destination);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
      oscillator.start(start);
      oscillator.stop(start + 0.19);
    }
  }

  dispose() {
    void this.context?.close().catch(() => undefined);
    this.context = undefined;
  }
}
