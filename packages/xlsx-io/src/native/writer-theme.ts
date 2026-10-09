import { DEFAULT_WORKBOOK_THEME } from "@sheetcraft/core/workbook-theme";
import { strToU8 } from "fflate/browser";
import { writeXlsxWorkbookTheme } from "../workbook-theme.js";

/** Seed the existing theme projection with all required DrawingML containers. */
export function writeNativeDefaultTheme(entries: Record<string, Uint8Array>): void {
  entries["xl/theme/theme1.xml"] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office">' +
      '<a:themeElements><a:clrScheme name="Office"></a:clrScheme>' +
      '<a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>' +
      '<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>' +
      '<a:fmtScheme name="Office"></a:fmtScheme></a:themeElements></a:theme>',
  );
  writeXlsxWorkbookTheme(entries, DEFAULT_WORKBOOK_THEME);
}
