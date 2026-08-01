"use client";

/**
 * Client-side host key handling for /deck, /summary and /editor.
 *
 * The server prints a /deck?key=... link at boot. Opening it once stores the
 * key in localStorage, so later visits and the other host screens work without
 * the query string.
 */

const STORAGE_KEY = "backlog_host_key";

export function captureHostKeyFromUrl(): void {
  if (typeof window === "undefined") return;
  const fromUrl = new URLSearchParams(window.location.search).get("key");
  if (fromUrl) {
    localStorage.setItem(STORAGE_KEY, fromUrl);
    // Keep the key out of the address bar so it isn't shoulder-surfed off the
    // projector or left in a screenshot.
    const clean = window.location.pathname + window.location.hash;
    window.history.replaceState(null, "", clean);
  }
}

export function getHostKey(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
}

export function hostHeaders(): Record<string, string> {
  const key = getHostKey();
  return key ? { "x-host-key": key } : {};
}

/** fetch() with the host key attached. */
export function hostFetch(input: string, init: RequestInit = {}) {
  return fetch(input, {
    ...init,
    headers: { ...(init.headers || {}), ...hostHeaders() },
  });
}
