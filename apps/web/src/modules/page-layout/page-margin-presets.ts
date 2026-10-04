import type { SheetPageSetup } from "@idea10/core/page-setup";

export type PageMargins = SheetPageSetup["margins"];

function fromPoints(margins: PageMargins): PageMargins {
  return {
    top: (margins.top * 25.4) / 72,
    bottom: (margins.bottom * 25.4) / 72,
    left: (margins.left * 25.4) / 72,
    right: (margins.right * 25.4) / 72,
    header: (margins.header * 25.4) / 72,
    footer: (margins.footer * 25.4) / 72,
  };
}

export const PAGE_MARGIN_PRESETS = {
  normal: fromPoints({ top: 72, bottom: 72, left: 54, right: 54, header: 36, footer: 36 }),
  narrow: fromPoints({ top: 54, bottom: 54, left: 18, right: 18, header: 21.5, footer: 21.5 }),
  wide: fromPoints({ top: 72, bottom: 72, left: 72, right: 72, header: 36, footer: 36 }),
};

export function pageMarginsMatch(left: PageMargins, right: PageMargins): boolean {
  return (Object.keys(left) as Array<keyof PageMargins>).every(
    (key) => Math.abs(left[key] - right[key]) < 0.000001,
  );
}

export function isPresetPageMargins(margins: PageMargins): boolean {
  return Object.values(PAGE_MARGIN_PRESETS).some((preset) => pageMarginsMatch(margins, preset));
}
