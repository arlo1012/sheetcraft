const DRAWING = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing";
const ART = "http://schemas.openxmlformats.org/drawingml/2006/main";
const drawing = new Set([
  "pic",
  "pic/nvPicPr",
  "pic/nvPicPr/cNvPr",
  "pic/nvPicPr/cNvPicPr",
  "pic/blipFill",
  "pic/spPr",
]);
const art = new Set([
  "pic/nvPicPr/cNvPicPr/picLocks",
  "pic/blipFill/blip",
  "pic/blipFill/srcRect",
  "pic/blipFill/stretch",
  "pic/blipFill/stretch/fillRect",
  "pic/spPr/xfrm",
  "pic/spPr/xfrm/off",
  "pic/spPr/xfrm/ext",
  "pic/spPr/prstGeom",
  "pic/spPr/prstGeom/avLst",
  "pic/spPr/ln",
  "pic/spPr/ln/noFill",
  "pic/spPr/ln/prstDash",
  "pic/spPr/ln/round",
  "pic/spPr/ln/bevel",
  "pic/spPr/ln/miter",
  "pic/spPr/ln/solidFill",
  "pic/spPr/effectLst",
  "pic/spPr/effectLst/outerShdw",
]);
for (const path of ["pic/spPr/ln/solidFill", "pic/spPr/effectLst/outerShdw"])
  for (const color of ["srgbClr", "schemeClr", "prstClr"]) {
    art.add(`${path}/${color}`);
    art.add(`${path}/${color}/alpha`);
  }
/** Namespace routing only; the picture reader separately proves every value. */
export function nativePictureElementNamespace(path: string): string | undefined {
  return drawing.has(path) ? DRAWING : art.has(path) ? ART : undefined;
}
