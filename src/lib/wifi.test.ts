import { describe, expect, it } from "vitest";

import { wifiQrPayload } from "./wifi";

describe("wifiQrPayload", () => {
  it("writes the payload a phone camera understands", () => {
    expect(wifiQrPayload({ ssid: "kleingarten", password: "MACfries00002" })).toBe(
      "WIFI:T:WPA;S:kleingarten;P:MACfries00002;;"
    );
  });

  it("escapes the characters that would end a field early", () => {
    expect(
      wifiQrPayload({ ssid: 'a;b:c', password: 'p\\a"ss,1' })
    ).toBe('WIFI:T:WPA;S:a\\;b\\:c;P:p\\\\a\\"ss\\,1;;');
  });

  it("marks a hidden network so the phone stops looking for the beacon", () => {
    expect(
      wifiQrPayload({ ssid: "koti", password: "salasana", hidden: true })
    ).toBe("WIFI:T:WPA;S:koti;P:salasana;H:true;;");
  });

  it("writes an open network without a password field", () => {
    expect(wifiQrPayload({ ssid: "vieras", password: "" })).toBe(
      "WIFI:T:nopass;S:vieras;;"
    );
  });
});
