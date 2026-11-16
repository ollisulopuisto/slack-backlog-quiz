// Enter during IME composition (CJK input) is the composition's confirm key,
// not a submit. legacy-scan (ime-safe-enter-submit) flagged the summary
// page's score field for committing on Enter without checking
// e.nativeEvent.isComposing / e.keyCode === 229 (React's synthetic
// KeyboardEvent does not carry isComposing, so the check also reads the
// native event). Wrap any onKeyDown that acts on Enter in this guard so
// composing keystrokes never reach it.
export type GuardedKeyEvent = {
  key?: string;
  isComposing?: boolean;
  keyCode?: number;
  nativeEvent?: { isComposing?: boolean; keyCode?: number };
};

export function guardIme<E extends GuardedKeyEvent>(handler: (e: E) => void): (e: E) => void {
  return (e) => {
    if (e.isComposing || e.keyCode === 229 || e.nativeEvent?.isComposing || e.nativeEvent?.keyCode === 229) return;
    handler(e);
  };
}
