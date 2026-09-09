import { api, json } from "@/lib/api";

type PushConfig = { enabled: boolean; public_key: string };

export function supportsComputerNotifications() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function applicationServerKey(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const raw = atob(padded);
  return Uint8Array.from(raw, character => character.charCodeAt(0));
}

function sameKey(current: ArrayBuffer | null, expected: Uint8Array<ArrayBuffer>) {
  if (!current) return false;
  const bytes = new Uint8Array(current);
  return bytes.length === expected.length && bytes.every((value, index) => value === expected[index]);
}

function subscriptionBody(subscription: PushSubscription) {
  const serialized = subscription.toJSON();
  if (!serialized.endpoint || !serialized.keys?.p256dh || !serialized.keys.auth) {
    throw new Error("O navegador não forneceu uma assinatura completa para notificações.");
  }
  return { endpoint: serialized.endpoint, keys: serialized.keys };
}

async function registration() {
  await navigator.serviceWorker.register("/push-sw.js", { scope: "/" });
  return navigator.serviceWorker.ready;
}

export async function restoreComputerNotifications() {
  if (!supportsComputerNotifications()) return false;
  const worker = await registration();
  const subscription = await worker.pushManager.getSubscription();
  if (!subscription) return false;
  await api("/push/subscribe", json("POST", subscriptionBody(subscription)));
  return true;
}

export async function enableComputerNotifications() {
  if (!supportsComputerNotifications()) {
    throw new Error("Este navegador não oferece notificações em segundo plano.");
  }
  // Start the permission request directly from the user's click.
  const permissionRequest = Notification.requestPermission();
  const [permission, worker, config] = await Promise.all([
    permissionRequest,
    registration(),
    api<PushConfig>("/push/config"),
  ]);
  if (permission !== "granted") {
    throw new Error("Permissão recusada. Libere as notificações deste site nas configurações do navegador.");
  }
  if (!config.enabled || !config.public_key) {
    throw new Error("O servidor ainda não possui as chaves de notificação.");
  }
  const expectedKey = applicationServerKey(config.public_key);
  let subscription = await worker.pushManager.getSubscription();
  if (subscription && !sameKey(subscription.options.applicationServerKey, expectedKey)) {
    await subscription.unsubscribe();
    subscription = null;
  }
  if (!subscription) {
    subscription = await worker.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: expectedKey,
    });
  }
  await api("/push/subscribe", json("POST", subscriptionBody(subscription)));
  return true;
}

export async function testComputerNotification() {
  await api("/push/test", { method: "POST" });
}

export async function disableComputerNotifications() {
  if (!supportsComputerNotifications()) return;
  const worker = await registration();
  const subscription = await worker.pushManager.getSubscription();
  if (!subscription) return;
  try {
    await api("/push/unsubscribe", json("POST", { endpoint: subscription.endpoint }));
  } finally {
    await subscription.unsubscribe();
  }
}
