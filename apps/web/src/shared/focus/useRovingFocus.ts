export type RovingFocusKey = "ArrowDown" | "ArrowUp" | "Home" | "End";

export function useRovingFocus() {
  function move(event: KeyboardEvent, items: readonly HTMLElement[]): boolean {
    if (!isRovingFocusKey(event.key) || items.length === 0) {
      return false;
    }

    event.preventDefault();
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    const nextIndex = getNextIndex(event.key, currentIndex, items.length);
    items[nextIndex]?.focus();
    return true;
  }

  return { move };
}

function isRovingFocusKey(key: string): key is RovingFocusKey {
  return key === "ArrowDown" || key === "ArrowUp" || key === "Home" || key === "End";
}

function getNextIndex(key: RovingFocusKey, currentIndex: number, count: number): number {
  if (key === "Home") {
    return 0;
  }
  if (key === "End") {
    return count - 1;
  }
  if (key === "ArrowUp") {
    return currentIndex <= 0 ? count - 1 : currentIndex - 1;
  }
  return currentIndex < 0 || currentIndex === count - 1 ? 0 : currentIndex + 1;
}
