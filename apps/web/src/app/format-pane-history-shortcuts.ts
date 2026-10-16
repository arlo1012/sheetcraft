import { getWorkbookHistoryShortcut } from "../shared/keyboard/workbook-history-shortcuts";

export interface FormatPaneHistoryContext {
  pane?: HTMLElement;
  current: () => boolean;
  blocked: boolean;
  editing: boolean;
  cropping: boolean;
  undo: () => unknown;
  redo: () => unknown;
}

/** Native select-only controls expose semantics; the app decides history ownership. */
export function isFormatPaneReadonlyHistoryControl(
  target: EventTarget | null,
): target is HTMLInputElement {
  return (
    target instanceof HTMLInputElement &&
    target.readOnly &&
    !target.disabled &&
    (target.getAttribute("data-format-pane-history-control") === "readonly-combobox" ||
      target.getAttribute("data-panel-select-control") === "readonly-combobox") &&
    target.getAttribute("role") === "combobox" &&
    target.getAttribute("aria-expanded") === "false"
  );
}

/** Only the current owned pane's command controls participate in workbook history. */
export function routeFormatPaneHistoryShortcut(
  event: KeyboardEvent,
  context: FormatPaneHistoryContext,
): boolean {
  const { pane } = context;
  if (
    !pane?.isConnected ||
    !context.current() ||
    context.blocked ||
    context.editing ||
    context.cropping ||
    event.defaultPrevented ||
    event.isComposing ||
    event.keyCode === 229 ||
    event.altKey ||
    event.repeat
  )
    return false;
  const target = event.target;
  if (
    !(target instanceof Element) ||
    !target.isConnected ||
    !pane.contains(target) ||
    target.closest("[data-shape-format-pane], [data-chart-format-pane]") !== pane ||
    target.closest(
      '[role="dialog"], [role="menu"], [role="listbox"], [contenteditable]:not([contenteditable="false"]), [role="textbox"]',
    )
  )
    return false;
  // Chart resets are explicit commands, shared by every element and numeric field.
  // Do not admit arbitrary chart buttons or native editors into workbook history.
  if (
    pane.hasAttribute("data-chart-format-pane") &&
    !target.closest("button[data-chart-format-reset]")
  )
    return false;
  const readonlyMode = isFormatPaneReadonlyHistoryControl(target);
  if (
    !readonlyMode &&
    (target.closest("input,textarea,select") ||
      !target.closest('button,[role="button"],[role="tab"],[role="radio"],[role="checkbox"]'))
  )
    return false;
  if (target.closest(':disabled,[aria-disabled="true"]')) return false;
  const action = getWorkbookHistoryShortcut(event, { allowEditableTarget: readonlyMode });
  if (!action || !context.current()) return false;
  event.preventDefault();
  event.stopPropagation();
  if (action === "undo") context.undo();
  else context.redo();
  return true;
}
