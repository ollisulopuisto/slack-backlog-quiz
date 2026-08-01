/**
 * The `WIFI:` URI a phone camera reads as "join this network".
 *
 * The format is the de-facto one every camera app implements (Android's
 * WifiDppUtils, iOS 11+, and every QR scanner in between): fields separated by
 * semicolons, terminated by an empty one. Nobody at the party is going to type
 * MACfries00002 correctly on the first go.
 *
 * `\`, `;`, `,`, `:` and `"` end a field or the payload, so a password
 * containing one has to escape it — otherwise the QR scans fine and silently
 * carries half a password.
 */

export interface WifiNetwork {
  ssid: string;
  password: string;
  /** A network that doesn't broadcast: the phone has to be told it's there. */
  hidden?: boolean;
}

function escapeField(value: string): string {
  return value.replace(/([\\;,:"])/g, "\\$1");
}

export function wifiQrPayload({ ssid, password, hidden }: WifiNetwork): string {
  const parts = [
    // An open network takes no password field at all; "WPA" covers WPA2 and
    // WPA3 too, which is what every scanner expects to see here.
    `T:${password ? "WPA" : "nopass"}`,
    `S:${escapeField(ssid)}`,
  ];
  if (password) parts.push(`P:${escapeField(password)}`);
  if (hidden) parts.push("H:true");
  return `WIFI:${parts.join(";")};;`;
}
