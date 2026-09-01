export type WorkbookHistoryShortcut = "undo" | "redo";

export type WorkbookHistoryShortcutOptions = {
  allowEditableTarget?: boolean;
};

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLInputElement && target.type !== "color") ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export function getWorkbookHistoryShortcut(
  event: KeyboardEvent,
  options: WorkbookHistoryShortcutOptions = {},
): WorkbookHistoryShortcut | undefined {
  if (!event.ctrlKey && !event.metaKey) {
    return undefined;
  }
  if (!options.allowEditableTarget && isEditableTarget(event.target)) {
    return undefined;
  }

  const key = event.key.toLowerCase();
  if (key === "z") {
    return event.shiftKey ? "redo" : "undo";
  }
  return key === "y" ? "redo" : undefined;
}
