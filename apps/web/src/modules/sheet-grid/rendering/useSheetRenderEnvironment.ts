import { onBeforeUnmount, onMounted, shallowRef } from "vue";
import { DEFAULT_CELL_FONT_FAMILY } from "@idea10/core/style";
import { cellTextFontRevision } from "../../../shared/cell-text/text-metrics";
import { DEFAULT_SHEET_HEADER_PALETTE, type SheetHeaderPalette } from "./header-painter";
import type { SheetCanvasPalette } from "../canvas/scene-painter";
import type { SheetOverlayPalette } from "./overlay-types";

export type SheetRenderEnvironment = Readonly<{
  density: number;
  fontFamily: string;
  cells: SheetCanvasPalette;
  headers: SheetHeaderPalette;
  overlays: SheetOverlayPalette;
}>;
const referenceColors = [
  "#0052d9",
  "#d54941",
  "#2ba471",
  "#ed7b2f",
  "#8e56dd",
  "#00a1a7",
  "#d43d8b",
  "#6d7d24",
];

/** Theme and DPR have one lifecycle per sheet. Font loading uses the shared metrics revision. */
export function useSheetRenderEnvironment(getRoot: () => HTMLElement | null) {
  const environment = shallowRef<SheetRenderEnvironment>({
    density: 1,
    fontFamily: DEFAULT_CELL_FONT_FAMILY,
    cells: { background: "#fff", text: "#202124", gridLine: "#e5e7eb", mutedText: "#666" },
    headers: DEFAULT_SHEET_HEADER_PALETTE,
    overlays: {
      actionPrimary: "#0052d9",
      mutedText: "#666",
      panel: "#fff",
      inverseText: "#fff",
      iconHover: "rgb(32 36 44 / 12%)",
      formulaReferenceColors: referenceColors,
    },
  });
  let observer: MutationObserver | undefined;
  let densityQuery: MediaQueryList | undefined;
  let mounted = false;
  function refresh(): void {
    const root = getRoot();
    if (!root) return;
    const style = getComputedStyle(root);
    const color = (name: string, fallback: string) =>
      style.getPropertyValue(`--idea-${name}`).trim() || fallback;
    const fontFamily = style.fontFamily.trim() || DEFAULT_CELL_FONT_FAMILY;
    const background = color("surface-panel", "#fff");
    const text = color("text-primary", "#202124");
    const mutedText = color("text-secondary", "#666");
    const action = color("action-primary", "#0052d9");
    environment.value = {
      density: window.devicePixelRatio || 1,
      fontFamily,
      cells: {
        background,
        text,
        gridLine: color("border-subtle", "#e5e7eb"),
        mutedText,
        errorIndicator: color("status-success", "#008a00"),
      },
      headers: {
        background: color("surface-secondary", "#f5f6f7"),
        hover: color("surface-hover", "#eceef0"),
        border: color("border-control", "#dcdfe4"),
        subtleBorder: color("border-subtle", "#e7e9ed"),
        text,
        mutedText,
        cornerText: color("text-muted", "#666"),
        action,
        actionSubtle: color("action-primary-subtle", "#e8f0ff"),
        actionFocus: color("action-focus", "#dce8ff"),
        panel: background,
        font: `400 12px ${fontFamily}`,
      },
      overlays: {
        actionPrimary: action,
        mutedText,
        panel: background,
        inverseText: color("text-inverse", "#fff"),
        iconHover: color("icon-button-hover-bg", "rgb(32 36 44 / 12%)"),
        formulaReferenceColors: referenceColors.map((fallback, index) =>
          color(`formula-reference-${index}`, fallback),
        ),
      },
    };
  }
  function observeDensity(): void {
    densityQuery?.removeEventListener("change", observeDensity);
    densityQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    densityQuery.addEventListener("change", observeDensity);
    refresh();
  }
  onMounted(() => {
    mounted = true;
    observeDensity();
    observer = new MutationObserver(refresh);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "theme-mode", "style"],
    });
    void document.fonts?.ready.then(() => {
      if (mounted) refresh();
    });
  });
  onBeforeUnmount(() => {
    mounted = false;
    observer?.disconnect();
    densityQuery?.removeEventListener("change", observeDensity);
  });
  return { environment, fontRevision: cellTextFontRevision };
}
