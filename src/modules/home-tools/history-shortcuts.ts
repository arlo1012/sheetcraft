export type WorkbookHistoryShortcut = "undo" | "redo";

export function getWorkbookHistoryShortcut(
  event: KeyboardEvent,
): WorkbookHistoryShortcut | undefined {
  if (!event.ctrlKey && !event.metaKey) {
    return undefined;
  }

  const target = event.target;
  if (
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLInputElement && target.type !== "color") ||
    (target instanceof HTMLElement && target.isContentEditable)
  ) {
    return undefined;
  }

  const key = event.key.toLowerCase();
  if (key === "z") {
    return event.shiftKey ? "redo" : "undo";
  }
  return key === "y" ? "redo" : undefined;
}
