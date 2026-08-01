import crypto from "crypto";
import { getHostKey } from "./store";

/**
 * Host authentication for the control endpoints.
 *
 * Every mutating room action was open to anyone who could reach the server, so
 * a single curl from a phone on the venue wifi could reset the game mid-event.
 * The host key is printed to the server console at boot as a ready-to-open
 * /deck?key=... link; players never need it.
 */

const HOST_KEY_HEADER = "x-host-key";

function safeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function isHostRequest(req: Request): boolean {
  const fromHeader = req.headers.get(HOST_KEY_HEADER);
  let provided = fromHeader;

  if (!provided) {
    try {
      provided = new URL(req.url).searchParams.get("key");
    } catch {
      provided = null;
    }
  }

  if (!provided) return false;
  return safeEquals(provided, getHostKey());
}

export function hostOnlyError() {
  return {
    error:
      "Vain juontaja voi tehdä tämän. Avaa /deck?key=... -linkki, jonka palvelin tulosti käynnistyessään.",
  };
}
