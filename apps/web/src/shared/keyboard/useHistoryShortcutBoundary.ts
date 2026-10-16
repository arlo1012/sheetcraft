import { onBeforeUnmount, onMounted } from "vue";
import { getWorkbookHistoryShortcut } from "./workbook-history-shortcuts";

/** Logical edit owners can keep toolbar/teleport shortcuts in their private history. */
export function useHistoryShortcutBoundary(options: {
  owns: (target: EventTarget | null) => boolean;
  composing: () => boolean;
  step: (direction: "undo" | "redo") => boolean | undefined;
}) {
  const keydown = (event: KeyboardEvent) => {
    if (
      event.defaultPrevented ||
      event.isComposing ||
      event.keyCode === 229 ||
      options.composing() ||
      !options.owns(event.target) ||
      !(event.target instanceof Element) ||
      event.target.closest("input, textarea, select, [contenteditable], [role='textbox']")
    )
      return;
    const direction = getWorkbookHistoryShortcut(event);
    if (!direction) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    options.step(direction);
  };
  onMounted(() => document.addEventListener("keydown", keydown, true));
  onBeforeUnmount(() => document.removeEventListener("keydown", keydown, true));
}
