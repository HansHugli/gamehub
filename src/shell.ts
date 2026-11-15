// What every page of the hub shares: nothing on a page can be selected, dragged or
// long-pressed into a menu, so a game never loses a swipe to the browser.

declare const __VERSION__: string;
export const VERSION: string = __VERSION__;

export function lockPage(): void {
  for (const type of ["selectstart", "dragstart", "contextmenu", "gesturestart"]) {
    document.addEventListener(type, (e) => e.preventDefault());
  }
  // Safari zooms on a double tap even with user-scalable=no; swallow the second tap's zoom
  let lastTouchEnd = 0;
  document.addEventListener("touchend", (e) => {
    const now = Date.now();
    if (now - lastTouchEnd < 320 && !(e.target instanceof Element && e.target.closest("a, button"))) e.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });
}

/** Browser storage that never throws (private windows, blocked site data). */
export const stored = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* the game plays on without saving */
    }
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      /* nothing to remove */
    }
  },
};
