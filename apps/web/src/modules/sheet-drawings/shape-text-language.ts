/** Detached canvases do not inherit the document's language. Native font fallback
 * uses it even for Latin text when the requested family is not installed. */
export function getShapeTextLanguage(): string {
  return typeof document === "undefined" ? "" : (document.documentElement?.lang ?? "");
}

export function syncShapeTextCanvasLanguage(canvas: HTMLCanvasElement): void {
  const language = getShapeTextLanguage();
  if (canvas.lang !== language) canvas.lang = language;
}
