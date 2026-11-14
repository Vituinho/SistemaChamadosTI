"use client";

import { useEffect, useRef, useState } from "react";
import { API_BASE, POLLING_ONLY } from "@/lib/env";

/**
 * Subscribes to an SSE endpoint using fetch (so the tracking key travels in a
 * header, never in the URL) and calls `onUpdate` for each update/expired event.
 * Disabled in the cPanel build (POLLING_ONLY): pages fall back to polling.
 * Returns whether the stream is currently connected.
 */
export function useEventStream(path: string | null, onUpdate: () => void, headers?: Record<string, string>): boolean {
  const [connected, setConnected] = useState(false);
  const callback = useRef(onUpdate);
  useEffect(() => {
    callback.current = onUpdate;
  });
  const headerKey = JSON.stringify(headers ?? {});

  useEffect(() => {
    if (!path || POLLING_ONLY) return;
    const controller = new AbortController();
    let retry: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    const connect = async () => {
      try {
        const response = await fetch(`${API_BASE}${path}`, {
          credentials: "include",
          headers: { Accept: "text/event-stream", ...JSON.parse(headerKey) },
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok || !response.body) throw new Error(`stream ${response.status}`);
        attempt = 0;
        setConnected(true);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let end: number;
          while ((end = buffer.indexOf("\n\n")) >= 0) {
            const chunk = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            if (/^event: (update|expired)$/m.test(chunk)) callback.current();
          }
        }
      } catch {
        // Network error or abort; reconnect below unless unmounted.
      }
      if (controller.signal.aborted) return;
      setConnected(false);
      attempt += 1;
      retry = setTimeout(connect, Math.min(30_000, 2_000 * 2 ** Math.min(attempt, 4)));
    };
    void connect();
    return () => {
      controller.abort();
      if (retry) clearTimeout(retry);
    };
  }, [path, headerKey]);

  return connected && !POLLING_ONLY;
}

/** True while the document is visible (used to pause non-essential polling). */
export function usePageVisible(): boolean {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== "hidden");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return visible;
}
