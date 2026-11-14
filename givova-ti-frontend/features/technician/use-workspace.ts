"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, hasFeature, type QueueQuery } from "@/lib/api/endpoints";
import { isApiError } from "@/lib/api/client";
import type { Catalog, Dashboard, TicketSummary } from "@/lib/api/types";
import { REFRESH } from "@/lib/env";
import { useEventStream, usePageVisible } from "@/lib/live-updates";

export const ME_KEY = ["auth", "me"] as const;

/**
 * Data orchestration for the technician workspace.
 *
 * Load profile (important for cPanel/PHP): only GET /dashboard is polled
 * (every 15 s, also in background so new-ticket alerts work). With the v2 API
 * the dashboard carries a `revision` (last history id); the queue and the open
 * ticket are refetched only when it changes. With the legacy API the visible
 * queue/detail fall back to 15 s polling while the tab is visible.
 * Outside cPanel an SSE stream triggers immediate refreshes.
 */
export function useWorkspaceData({ query, selectedId, onNewTicket, catalog }: {
  query: QueueQuery | null;
  selectedId: number | null;
  onNewTicket: (ticket: TicketSummary, count: number) => void;
  catalog: Catalog | undefined;
}) {
  const client = useQueryClient();
  const visible = usePageVisible();

  const onUnauthorized = useCallback(
    (error: unknown) => {
      if (isApiError(error, 401)) client.setQueryData(ME_KEY, null);
    },
    [client],
  );

  const revisionAware = hasFeature(catalog, "revision");

  const dashboard = useQuery({
    queryKey: ["dashboard"],
    queryFn: ({ signal }) => api.dashboard(signal),
    refetchInterval: REFRESH.dashboard,
    refetchIntervalInBackground: true,
    staleTime: 0,
  });

  const queue = useQuery({
    queryKey: ["tickets", query],
    queryFn: ({ signal }) => api.tickets(query!, signal),
    enabled: query !== null,
    placeholderData: keepPreviousData,
    refetchInterval: !revisionAware && visible ? REFRESH.legacyQueue : false,
    staleTime: revisionAware ? 60_000 : 5_000,
  });

  const detail = useQuery({
    queryKey: ["ticket", selectedId],
    queryFn: ({ signal }) => api.ticket(selectedId!, signal),
    enabled: selectedId !== null,
    refetchInterval: !revisionAware && visible ? REFRESH.legacyQueue : false,
    staleTime: revisionAware ? 60_000 : 5_000,
  });

  useEffect(() => {
    for (const error of [dashboard.error, queue.error, detail.error]) onUnauthorized(error);
  }, [dashboard.error, queue.error, detail.error, onUnauthorized]);

  // React to dashboard changes: new tickets and data revisions.
  const previous = useRef<Dashboard | null>(null);
  const notify = useRef(onNewTicket);
  useEffect(() => {
    notify.current = onNewTicket;
  });
  useEffect(() => {
    const current = dashboard.data;
    if (!current) return;
    const before = previous.current;
    previous.current = current;
    if (!before) return;
    if (current.latest_id > before.latest_id) {
      const count = current.latest_id - before.latest_id;
      void client
        .fetchQuery({ queryKey: ["ticket", current.latest_id], queryFn: ({ signal }) => api.ticket(current.latest_id, signal) })
        .then(ticket => notify.current(ticket, count))
        .catch(() => undefined);
    }
    const changed = current.revision !== undefined ? current.revision !== before.revision : current.latest_id !== before.latest_id;
    if (changed) {
      void client.invalidateQueries({ queryKey: ["tickets"] });
      void client.invalidateQueries({ queryKey: ["ticket"] });
    }
  }, [dashboard.data, client]);

  const refreshAll = useCallback(() => void client.invalidateQueries({ queryKey: ["dashboard"] }), [client]);
  const live = useEventStream("/events", refreshAll);

  return { dashboard, queue, detail, live, refreshAll, revisionAware };
}


export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
}
