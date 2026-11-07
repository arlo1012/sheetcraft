// 未执行：按用户要求仅编写测试，不运行检查。
// 仅检查 DOCX 解析与独立 HTML 文档；分页、缩放和绘制由真实界面验收覆盖。
import { describe, expect, test } from "vitest";
import { strToU8, zipSync } from "fflate";
import type { SheetAttachment } from "@sheetcraft/core/sheet-attachments";
import {
  decodeAttachmentBytes,
  encodeAttachmentBytes,
} from "../../../modules/attachments/attachment-file";
import {
  isWordAttachment,
  readWordAttachmentPreview,
} from "../../../modules/attachments/word-preview";

const docxMime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;
const officeRelationship = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
const documentRelationships = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
const styles = `<?xml version="1.0" encoding="UTF-8"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="PreviewHeading">
    <w:name w:val="Preview Heading"/>
    <w:rPr><w:color w:val="123456"/><w:sz w:val="32"/></w:rPr>
  </w:style>
</w:styles>`;
const documentXml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:pPr><w:pStyle w:val="PreviewHeading"/></w:pPr><w:r><w:t>First paragraph</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>第二段中文加粗</w:t></w:r></w:p>
    <w:p><w:r><w:t>Third paragraph</w:t></w:r></w:p>
    <w:tbl>
      <w:tblPr><w:tblW w:w="6000" w:type="dxa"/></w:tblPr>
      <w:tblGrid><w:gridCol w:w="3000"/><w:gridCol w:w="3000"/></w:tblGrid>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Header A</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Header B</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Cell A</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Cell B</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`;

function packageBytes(includeDocument = true) {
  return zipSync({
    "[Content_Types].xml": strToU8(contentTypes),
    "_rels/.rels": strToU8(officeRelationship),
    "word/_rels/document.xml.rels": strToU8(documentRelationships),
    "word/styles.xml": strToU8(styles),
    ...(includeDocument ? { "word/document.xml": strToU8(documentXml) } : {}),
  });
}
function attachment(
  bytes: Uint8Array,
  filename = "preview.docx",
  mimeType = docxMime,
): SheetAttachment {
  return {
    filename,
    mimeType,
    size: bytes.length,
    data: encodeAttachmentBytes(bytes),
    display: "document",
  };
}

describe("Word attachment document preview", () => {
  test("reads three paragraphs, a table and Word formatting into a standalone preview document", async () => {
    const bytes = packageBytes();
    const originalBytes = bytes.slice();
    const value = attachment(bytes);
    const before = structuredClone(value);
    expect(isWordAttachment(value)).toBe(true);

    const preview = await readWordAttachmentPreview(value);
    expect(preview).toBeDefined();
    expect(Number.isFinite(preview!.width)).toBe(true);
    expect(preview!.width).toBeGreaterThan(0);
    // 8.5 inch page minus two 1 inch margins, at 96 CSS pixels per inch.
    expect(preview!.width).toBe(624);
    expect(preview!.html).toMatch(/<html[\s>]/i);
    expect(preview!.html).toMatch(/<body[\s>]/i);
    const rendered = new DOMParser().parseFromString(preview!.html, "text/html");
    expect(
      Array.from(rendered.querySelectorAll("p"), (paragraph) => paragraph.textContent),
    ).toEqual(expect.arrayContaining(["First paragraph", "第二段中文加粗", "Third paragraph"]));
    expect(
      Array.from(rendered.querySelectorAll("table tr"), (row) =>
        Array.from(row.querySelectorAll("td, th"), (cell) => cell.textContent),
      ),
    ).toEqual([
      ["Header A", "Header B"],
      ["Cell A", "Cell B"],
    ]);
    const bold = Array.from(rendered.querySelectorAll<HTMLElement>("span, b, strong")).find(
      (element) =>
        element.textContent === "第二段中文加粗" &&
        (element.tagName === "B" ||
          element.tagName === "STRONG" ||
          element.style.fontWeight === "bold" ||
          Number(element.style.fontWeight) >= 600),
    );
    expect(bold).toBeDefined();
    expect(
      Array.from(rendered.querySelectorAll("style"), (style) => style.textContent).join("\n"),
    ).toContain("#123456");
    expect(value).toEqual(before);
    expect(bytes).toEqual(originalBytes);
    expect(decodeAttachmentBytes(value.data)).toEqual(originalBytes);
  });

  test.each([
    { filename: "REPORT.DOCX", mimeType: "application/octet-stream" },
    { filename: "report.bin", mimeType: docxMime },
  ])("recognizes Word attachments from filename or MIME: $filename", ({ filename, mimeType }) => {
    expect(isWordAttachment(attachment(packageBytes(), filename, mimeType))).toBe(true);
  });

  test.each([
    { filename: "notes.txt", mimeType: "text/plain" },
    { filename: "legacy.doc", mimeType: "application/msword" },
    {
      filename: "table.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  ])("falls back for non-DOCX $filename", async ({ filename, mimeType }) => {
    const value = attachment(strToU8("unsupported document"), filename, mimeType);
    const before = structuredClone(value);
    expect(isWordAttachment(value)).toBe(false);
    await expect(readWordAttachmentPreview(value)).resolves.toBeUndefined();
    expect(value).toEqual(before);
  });

  test.each([
    { name: "invalid ZIP", bytes: strToU8("This is not an Office ZIP package") },
    { name: "missing Word document part", bytes: packageBytes(false) },
  ])("falls back without rejecting or changing a damaged DOCX: $name", async ({ bytes }) => {
    const value = attachment(bytes);
    const before = structuredClone(value);
    expect(isWordAttachment(value)).toBe(true);
    await expect(readWordAttachmentPreview(value)).resolves.toBeUndefined();
    expect(value).toEqual(before);
    expect(decodeAttachmentBytes(value.data)).toEqual(bytes);
  });
});
