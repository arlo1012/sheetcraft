import { strFromU8, strToU8 } from "fflate/browser";

export type NativeCellImage = Readonly<{
  /** Zero-based worksheet index in the generated XLSX package. */
  sheetIndex: number;
  address: string;
  /** `image1.png` or `xl/media/image1.png`, already present in `entries`. */
  mediaFilename: string;
  altText: string;
}>;

const CONTENT_TYPE_OVERRIDES = [
  [
    "/xl/metadata.xml",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheetMetadata+xml",
  ],
  ["/xl/richData/rdRichValueTypes.xml", "application/vnd.ms-excel.rdrichvaluetypes+xml"],
  ["/xl/richData/rdrichvalue.xml", "application/vnd.ms-excel.rdrichvalue+xml"],
  ["/xl/richData/rdrichvaluestructure.xml", "application/vnd.ms-excel.rdrichvaluestructure+xml"],
  ["/xl/richData/richValueRel.xml", "application/vnd.ms-excel.richvaluerel+xml"],
] as const;

const RICH_VALUE_RELATIONSHIPS = [
  [
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/sheetMetadata",
    "metadata.xml",
  ],
  [
    "http://schemas.microsoft.com/office/2022/10/relationships/richValueRel",
    "richData/richValueRel.xml",
  ],
  [
    "http://schemas.microsoft.com/office/2017/06/relationships/rdRichValue",
    "richData/rdrichvalue.xml",
  ],
  [
    "http://schemas.microsoft.com/office/2017/06/relationships/rdRichValueStructure",
    "richData/rdrichvaluestructure.xml",
  ],
  [
    "http://schemas.microsoft.com/office/2017/06/relationships/rdRichValueTypes",
    "richData/rdRichValueTypes.xml",
  ],
] as const;

function sanitizeXmlText(value: string): string {
  let result = "";
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    if (
      codePoint === 0x9 ||
      codePoint === 0xa ||
      codePoint === 0xd ||
      (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
      (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
      (codePoint >= 0x10000 && codePoint <= 0x10ffff)
    )
      result += character;
  }
  return result;
}

function escapeXml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!,
  );
}

function readEntry(entries: Readonly<Record<string, Uint8Array>>, name: string): string {
  const value = entries[name];
  if (!value) throw new Error(`Missing XLSX entry: ${name}.`);
  return strFromU8(value);
}

function writeEntry(entries: Record<string, Uint8Array>, name: string, value: string): void {
  entries[name] = strToU8(value);
}

function normalizeMediaFilename(filename: string): string {
  const name = filename.startsWith("xl/media/") ? filename.slice("xl/media/".length) : filename;
  if (!name || name.includes("/") || name.includes("\\"))
    throw new Error(`Invalid XLSX media filename: ${filename}.`);
  return name;
}

function insertBeforeClosingTag(xml: string, tag: string, insertion: string): string {
  const closingTag = `</${tag}>`;
  const index = xml.lastIndexOf(closingTag);
  if (index < 0) throw new Error(`Invalid XLSX XML: missing ${closingTag}.`);
  return `${xml.slice(0, index)}${insertion}${xml.slice(index)}`;
}

function nextRelationshipId(xml: string): number {
  return [...xml.matchAll(/\bId="rId(\d+)"/g)].reduce(
    (highest, match) => Math.max(highest, Number(match[1])),
    0,
  );
}

function addContentTypeOverrides(entries: Record<string, Uint8Array>): void {
  const xml = readEntry(entries, "[Content_Types].xml");
  const insertion = CONTENT_TYPE_OVERRIDES.filter(
    ([partName]) => !xml.includes(`PartName="${partName}"`),
  )
    .map(
      ([partName, contentType]) =>
        `<Override PartName="${partName}" ContentType="${contentType}"/>`,
    )
    .join("");
  if (insertion)
    writeEntry(entries, "[Content_Types].xml", insertBeforeClosingTag(xml, "Types", insertion));
}

function addWorkbookRelationships(entries: Record<string, Uint8Array>): void {
  const name = "xl/_rels/workbook.xml.rels";
  const xml = readEntry(entries, name);
  let nextId = nextRelationshipId(xml);
  const insertion = RICH_VALUE_RELATIONSHIPS.filter(
    ([type, target]) => !xml.includes(`Type="${type}"`) && !xml.includes(`Target="${target}"`),
  )
    .map(([type, target]) => {
      nextId += 1;
      return `<Relationship Id="rId${nextId}" Type="${type}" Target="${target}"/>`;
    })
    .join("");
  if (insertion) writeEntry(entries, name, insertBeforeClosingTag(xml, "Relationships", insertion));
}

function replaceCellWithRichValue(xml: string, address: string, metadataIndex: number): string {
  const escapedAddress = address.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const cellPattern = new RegExp(`<c\\b([^>]*\\br="${escapedAddress}"[^>]*)>([\\s\\S]*?)</c>`);
  const match = cellPattern.exec(xml);
  if (!match) throw new Error(`Missing XLSX cell for native image: ${address}.`);
  const attributes = match[1]!.replace(/\s+t="[^"]*"/g, "").replace(/\s+vm="[^"]*"/g, "");
  return `${xml.slice(0, match.index)}<c${attributes} t="e" vm="${metadataIndex}"><v>#VALUE!</v></c>${xml.slice(
    match.index + match[0].length,
  )}`;
}

function writeRichDataParts(
  entries: Record<string, Uint8Array>,
  images: readonly NativeCellImage[],
): void {
  const mediaNames = [
    ...new Set(images.map((image) => normalizeMediaFilename(image.mediaFilename))),
  ];
  const mediaIndex = new Map(mediaNames.map((name, index) => [name, index]));
  const hasAltText = images.some((image) => sanitizeXmlText(image.altText).length > 0);
  const valueFields = hasAltText ? '<k n="Text" t="s"/>' : "";
  const values = images
    .map((image) => {
      const index = mediaIndex.get(normalizeMediaFilename(image.mediaFilename));
      if (index === undefined) throw new Error("Missing native image media index.");
      return `<rv s="0"><v>${index}</v><v>5</v>${hasAltText ? `<v>${escapeXml(sanitizeXmlText(image.altText))}</v>` : ""}</rv>`;
    })
    .join("");
  const metadataEntries = images
    .map(
      (_, index) =>
        `<bk><extLst><ext uri="{3e2802c4-a4d2-4d8b-9148-e3be6c30e623}"><xlrd:rvb i="${index}"/></ext></extLst></bk>`,
    )
    .join("");
  const valueMetadata = images.map((_, index) => `<bk><rc t="1" v="${index}"/></bk>`).join("");
  const relationshipSlots = mediaNames.map((_, index) => `<rel r:id="rId${index + 1}"/>`).join("");
  const mediaRelationships = mediaNames
    .map(
      (name, index) =>
        `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${escapeXml(name)}"/>`,
    )
    .join("");

  writeEntry(
    entries,
    "xl/metadata.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><metadata xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:xlrd="http://schemas.microsoft.com/office/spreadsheetml/2017/richdata"><metadataTypes count="1"><metadataType name="XLRICHVALUE" minSupportedVersion="120000" copy="1" pasteAll="1" pasteValues="1" merge="1" splitFirst="1" rowColShift="1" clearFormats="1" clearComments="1" assign="1" coerce="1"/></metadataTypes><futureMetadata name="XLRICHVALUE" count="${images.length}">${metadataEntries}</futureMetadata><valueMetadata count="${images.length}">${valueMetadata}</valueMetadata></metadata>`,
  );
  writeEntry(
    entries,
    "xl/richData/rdrichvalue.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><rvData xmlns="http://schemas.microsoft.com/office/spreadsheetml/2017/richdata" count="${images.length}">${values}</rvData>`,
  );
  writeEntry(
    entries,
    "xl/richData/rdrichvaluestructure.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><rvStructures xmlns="http://schemas.microsoft.com/office/spreadsheetml/2017/richdata" count="1"><s t="_localImage"><k n="_rvRel:LocalImageIdentifier" t="i"/><k n="CalcOrigin" t="i"/>${valueFields}</s></rvStructures>`,
  );
  writeEntry(
    entries,
    "xl/richData/rdRichValueTypes.xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><rvTypesInfo xmlns="http://schemas.microsoft.com/office/spreadsheetml/2017/richdata2" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="x" xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><global><keyFlags><key name="_Self"><flag name="ExcludeFromFile" value="1"/><flag name="ExcludeFromCalcComparison" value="1"/></key><key name="_DisplayString"><flag name="ExcludeFromCalcComparison" value="1"/></key><key name="_Flags"><flag name="ExcludeFromCalcComparison" value="1"/></key><key name="_Format"><flag name="ExcludeFromCalcComparison" value="1"/></key><key name="_SubLabel"><flag name="ExcludeFromCalcComparison" value="1"/></key><key name="_Attribution"><flag name="ExcludeFromCalcComparison" value="1"/></key><key name="_Icon"><flag name="ExcludeFromCalcComparison" value="1"/></key><key name="_Display"><flag name="ExcludeFromCalcComparison" value="1"/></key><key name="_CanonicalPropertyNames"><flag name="ExcludeFromFile" value="1"/><flag name="ExcludeFromCalcComparison" value="1"/></key><key name="_ClassificationId"><flag name="ExcludeFromCalcComparison" value="1"/></key></keyFlags></global></rvTypesInfo>',
  );
  writeEntry(
    entries,
    "xl/richData/richValueRel.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><richValueRels xmlns="http://schemas.microsoft.com/office/spreadsheetml/2022/richvaluerel" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${relationshipSlots}</richValueRels>`,
  );
  writeEntry(
    entries,
    "xl/richData/_rels/richValueRel.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${mediaRelationships}</Relationships>`,
  );
}

/**
 * Adds Excel 365 "Place in Cell" rich-data parts to a freshly generated XLSX package.
 * The caller owns ZIP decoding/encoding and media insertion.
 */
export function addNativeCellImages(
  entries: Record<string, Uint8Array>,
  images: readonly NativeCellImage[],
): void {
  if (images.length === 0) return;
  readEntry(entries, "[Content_Types].xml");
  readEntry(entries, "xl/_rels/workbook.xml.rels");
  const seenCells = new Set<string>();
  for (const image of images) {
    const mediaName = normalizeMediaFilename(image.mediaFilename);
    if (!entries[`xl/media/${mediaName}`]) throw new Error(`Missing XLSX media: ${mediaName}.`);
    const cellKey = `${image.sheetIndex}:${image.address}`;
    if (seenCells.has(cellKey)) throw new Error(`Duplicate native image cell: ${image.address}.`);
    seenCells.add(cellKey);
    replaceCellWithRichValue(
      readEntry(entries, `xl/worksheets/sheet${image.sheetIndex + 1}.xml`),
      image.address,
      0,
    );
  }
  for (const [index, image] of images.entries()) {
    const sheetName = `xl/worksheets/sheet${image.sheetIndex + 1}.xml`;
    writeEntry(
      entries,
      sheetName,
      replaceCellWithRichValue(readEntry(entries, sheetName), image.address, index + 1),
    );
  }
  addContentTypeOverrides(entries);
  addWorkbookRelationships(entries);
  writeRichDataParts(entries, images);
}
