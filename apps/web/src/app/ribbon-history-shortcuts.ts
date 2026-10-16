import { getWorkbookHistoryShortcut } from "../shared/keyboard/workbook-history-shortcuts";

export interface RibbonHistoryContext {
  blocked: boolean;
  editing: boolean;
  cropping: boolean;
  undo: () => unknown;
  redo: () => unknown;
}

/** Workspace capture route for the Ribbon only; Grid and editable owners retain their history. */
export function routeRibbonHistoryShortcut(
  event: KeyboardEvent,
  context: RibbonHistoryContext,
): boolean {
  if (
    context.blocked ||
    context.editing ||
    context.cropping ||
    event.defaultPrevented ||
    event.isComposing ||
    event.altKey ||
    event.repeat
  )
    return false;
  const target = event.target;
  if (!(target instanceof Element) || !target.closest('[data-workbook-history-surface="ribbon"]'))
    return false;
  if (
    target.closest(
      'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="dialog"], [role="menu"], [role="listbox"]',
    )
  )
    return false;
  const action = getWorkbookHistoryShortcut(event);
  if (!action) return false;
  event.preventDefault();
  event.stopPropagation();
  if (action === "undo") context.undo();
  else context.redo();
  return true;
}
