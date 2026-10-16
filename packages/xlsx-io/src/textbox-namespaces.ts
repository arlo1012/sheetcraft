const DRAWING_NS = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing";
const ART_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
const drawingPaths = new Set([
  "sp",
  "sp/nvSpPr",
  "sp/nvSpPr/cNvPr",
  "sp/nvSpPr/cNvSpPr",
  "sp/spPr",
  "sp/style",
  "sp/txBody",
]);
const artPaths = new Set([
  "sp/nvSpPr/cNvSpPr/spLocks",
  "sp/spPr/xfrm",
  "sp/spPr/xfrm/off",
  "sp/spPr/xfrm/ext",
  "sp/spPr/prstGeom",
  "sp/spPr/prstGeom/avLst",
  "sp/spPr/noFill",
  "sp/spPr/effectLst",
  "sp/spPr/ln",
  "sp/spPr/ln/noFill",
  "sp/spPr/ln/prstDash",
  "sp/spPr/ln/round",
  "sp/spPr/ln/bevel",
  "sp/spPr/ln/miter",
  "sp/style/lnRef",
  "sp/style/lnRef/scrgbClr",
  "sp/style/fillRef",
  "sp/style/fillRef/scrgbClr",
  "sp/style/effectRef",
  "sp/style/effectRef/scrgbClr",
  "sp/style/fontRef",
  "sp/style/fontRef/schemeClr",
  "sp/style/fontRef/srgbClr",
  "sp/txBody/bodyPr",
  "sp/txBody/bodyPr/noAutofit",
  "sp/txBody/lstStyle",
  "sp/txBody/p",
  "sp/txBody/p/pPr",
  "sp/txBody/p/r",
  "sp/txBody/p/r/t",
  "sp/txBody/p/pPr/lnSpc",
  "sp/txBody/p/pPr/lnSpc/spcPct",
  "sp/txBody/p/pPr/spcBef",
  "sp/txBody/p/pPr/spcBef/spcPts",
  "sp/txBody/p/pPr/spcAft",
  "sp/txBody/p/pPr/spcAft/spcPts",
]);
for (const properties of [
  "sp/txBody/p/pPr/defRPr",
  "sp/txBody/p/r/rPr",
  "sp/txBody/p/endParaRPr",
]) {
  artPaths.add(properties);
  for (const child of ["latin", "ea", "cs", "effectLst", "ln", "ln/noFill"])
    artPaths.add(`${properties}/${child}`);
}
for (const owner of [
  "sp/spPr",
  "sp/spPr/ln",
  "sp/txBody/p/pPr/defRPr",
  "sp/txBody/p/r/rPr",
  "sp/txBody/p/endParaRPr",
]) {
  artPaths.add(`${owner}/solidFill`);
  for (const color of ["srgbClr", "schemeClr"]) {
    artPaths.add(`${owner}/solidFill/${color}`);
    artPaths.add(`${owner}/solidFill/${color}/shade`);
  }
}

/** Namespace routing only. The textbox reader must independently prove every value/attribute. */
export function nativeTextBoxElementNamespace(relativePath: string): string | undefined {
  if (drawingPaths.has(relativePath)) return DRAWING_NS;
  if (artPaths.has(relativePath)) return ART_NS;
}
