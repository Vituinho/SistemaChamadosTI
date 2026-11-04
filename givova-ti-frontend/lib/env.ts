/**
 * Build-time public configuration. Never put secrets in NEXT_PUBLIC_* variables:
 * they are embedded in the static bundle.
 *
 * cPanel build (CPANEL_EXPORT=1): API is same-origin "/api" (PHP proxy) and
 * live updates use polling, because long-lived SSE connections would tie up
 * shared-hosting PHP workers.
 */
export const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/+$/, "");
export const POLLING_ONLY = process.env.NEXT_PUBLIC_POLLING_ONLY === "1";
export const TUTORIAL_YOUTUBE_URL = process.env.NEXT_PUBLIC_TUTORIAL_YOUTUBE_URL || "";
export const TUTORIAL_VIDEO_URL = process.env.NEXT_PUBLIC_TUTORIAL_VIDEO_URL || "/tutorial.mp4";

/** Refresh cadence (ms). One lightweight request per interval per open page. */
export const REFRESH = {
  dashboard: 15_000,
  tracking: 15_000,
  /** Without a revision counter (legacy API) the visible queue is refreshed at this pace. */
  legacyQueue: 15_000,
} as const;
