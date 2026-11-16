// Enter during IME composition (CJK input) is the composition's confirm key,
// not a submit. legacy-scan (ime-safe-enter-submit) flagged the score
// field's onKeyDown in the summary page for blurring (committing the score)
// without checking e.isComposing / e.keyCode === 229. The page is a client
// component without a DOM harness here, so this anchors the guard in source.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("the summary score field's Enter handler", () => {
  it("returns early during IME composition", () => {
    const source = readFileSync("src/app/summary/page.tsx", "utf8").split("\n");
    const handler = source.findIndex((line) => line.includes("onKeyDown={(e) => {"));
    expect(handler, "score field onKeyDown not found; re-anchor the test").toBeGreaterThan(-1);
    const head = source.slice(handler + 1, handler + 4).join("\n");
    expect(head).toMatch(/isComposing/);
  });
});
