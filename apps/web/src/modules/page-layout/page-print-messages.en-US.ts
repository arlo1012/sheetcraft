import type { PagePrintMessageSchema } from "./page-print-messages";

export const pagePrintEnUS = {
  pagePrint: {
    unsupportedEquations:
      "Equation printing is unavailable because mathematical layout or fonts could not be verified. No blank print will be generated, and your workbook is unchanged.",
    preparingEquations: "Preparing mathematical layout and fonts…",
    invalidRange:
      "Cannot preview this print range. Check page settings or narrow the range (up to 10,000 pages).",
    unsupportedPictures:
      "Print preview does not support picture frames or owned picture groups yet. Your workbook is unchanged.",
    popupBlocked: "Allow pop-up windows to print.",
    failed: "Images are not ready or printing failed. Please try again.",
    title: "Print preview",
    print: "Print",
    previous: "Previous page",
    next: "Next page",
    pageOf: "Page {page} of {count}",
    thumbnails: "Pages",
    preview: "Page preview",
    close: "Close print preview",
  },
} satisfies PagePrintMessageSchema;
