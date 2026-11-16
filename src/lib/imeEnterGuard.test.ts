// Enter during IME composition (CJK input) is the composition's confirm key,
// not a submit. legacy-scan (ime-safe-enter-submit) flagged the summary
// page's score field for committing on Enter without checking
// e.nativeEvent.isComposing / e.keyCode === 229. The page wraps its onKeyDown
// in guardIme; this drives the guard with composing and plain keydown events.
import { describe, expect, it } from "vitest";
import { guardIme, type GuardedKeyEvent } from "./imeEnterGuard";

type TestEvent = GuardedKeyEvent & { key?: string };

describe("guardIme", () => {
  it("blocks keydowns while an IME composition is open", () => {
    const seen: TestEvent[] = [];
    const handler = guardIme((e: TestEvent) => seen.push(e));
    handler({ key: "Enter", nativeEvent: { isComposing: true } });
    handler({ key: "Enter", keyCode: 229 });
    expect(seen).toHaveLength(0);
  });

  it("passes plain keydowns through with the original event", () => {
    const seen: TestEvent[] = [];
    const handler = guardIme((e: TestEvent) => seen.push(e));
    const plain: TestEvent = { key: "Enter", nativeEvent: { isComposing: false, keyCode: 13 } };
    handler(plain);
    handler({ key: "Escape" });
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe(plain);
  });
});
