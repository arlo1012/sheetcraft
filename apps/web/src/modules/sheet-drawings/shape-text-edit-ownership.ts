/** Shared focus/pointer boundary for an exact shape-text lease and its controlled popups. */
export function ownsShapeTextEditTarget(target: EventTarget | null, sessionId: number): boolean {
  if (!(target instanceof Node)) return false;
  const owner = `[data-shape-text-edit-session="${sessionId}"]`;
  const element = target instanceof Element ? target : target.parentElement;
  if (element?.closest(owner)) return true;
  for (const control of document.querySelectorAll(
    `${owner} [aria-controls]:not([role="tab"]), ${owner}[aria-controls]:not([role="tab"])`,
  ))
    for (const id of (control.getAttribute("aria-controls") ?? "").split(/\s+/))
      if (id && document.getElementById(id)?.contains(target)) return true;
  return false;
}

/** Restore only the currently mounted input for this exact lease. */
export function focusShapeTextEditInput(sessionId: number): void {
  const input = document.querySelector<HTMLElement>(
    `[data-shape-canvas-text-input][data-shape-text-edit-session="${sessionId}"]`,
  );
  if (!input) return;
  // The canvas owner restores its saved attributed selection imperatively. Ordinary
  // mouse focus must keep the browser's newly clicked caret rather than overwrite it.
  const request = new Event("shape-text-request-focus", { bubbles: true, cancelable: true });
  if (input.dispatchEvent(request)) input.focus({ preventScroll: true });
}
