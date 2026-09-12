/** Inputs and formula tools share one draft while focus moves between their surfaces. */
export function isCellEditSessionTarget(target: EventTarget | null, sessionId: string): boolean {
  return (
    target instanceof Element &&
    target.closest("[data-cell-edit-session]")?.getAttribute("data-cell-edit-session") === sessionId
  );
}
