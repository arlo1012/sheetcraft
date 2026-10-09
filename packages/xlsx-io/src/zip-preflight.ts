import { CompatibilityReportBuilder } from "./report.js";
import {
  XlsxAbortError,
  XlsxCompatibilityError,
  type AbortSignalLike,
  type XlsxCompatibilityReport,
} from "./types.js";

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const LOCAL_FILE_SIGNATURE = 0x04034b50;
const MAX_ARCHIVE_BYTES = 25 * 1024 * 1024;
const MAX_ENTRIES = 2_000;
const MAX_ENTRY_UNCOMPRESSED_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 32 * 1024 * 1024;

type ZipEntry = Readonly<{
  name: string;
  compression: number;
  compressedOffset: number;
  compressedSize: number;
  uncompressedSize: number;
}>;

function assertNotAborted(signal: AbortSignalLike | undefined): void {
  if (signal?.aborted) throw new XlsxAbortError();
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  let value = "";
  for (let index = 0; index < length; index += 1)
    value += String.fromCharCode(bytes[offset + index] ?? 0);
  return value;
}

function fail(
  code: Parameters<CompatibilityReportBuilder["add"]>[0],
  report: CompatibilityReportBuilder,
  issueLocation?: string,
): never {
  report.add(code, "block", issueLocation);
  throw new XlsxCompatibilityError("The XLSX archive is not supported.", report.build());
}

function findEndOfCentralDirectory(view: DataView): number | null {
  const start = Math.max(0, view.byteLength - 65_557);
  for (let offset = view.byteLength - 22; offset >= start; offset -= 1) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) return offset;
  }
  return null;
}

function isUnsafePath(name: string): boolean {
  return (
    !name ||
    name.startsWith("/") ||
    name.includes("\\") ||
    name.split("/").some((part) => part === "..")
  );
}

function decodeXmlEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|apos|gt|lt|quot);/gi, (entity, token: string) => {
    const normalized = token.toLowerCase();
    const named: Record<string, string> = {
      amp: "&",
      apos: "'",
      gt: ">",
      lt: "<",
      quot: '"',
    };
    if (normalized in named) return named[normalized] ?? entity;
    const codePoint = normalized.startsWith("#x")
      ? Number.parseInt(normalized.slice(2), 16)
      : Number.parseInt(normalized.slice(1), 10);
    return Number.isSafeInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
      ? String.fromCodePoint(codePoint)
      : entity;
  });
}

function decodeXml(bytes: Uint8Array): string | null {
  const hasUtf16Bom =
    (bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff);
  if (hasUtf16Bom) return null;
  const TextDecoderConstructor = (
    globalThis as unknown as {
      TextDecoder?: new (
        label?: string,
        options?: { fatal?: boolean },
      ) => {
        decode: (input?: Uint8Array) => string;
      };
    }
  ).TextDecoder;
  if (!TextDecoderConstructor) return null;
  let xml: string;
  try {
    xml = new TextDecoderConstructor("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
  const declaration = /^\s*<\?xml\s+[^>]*encoding\s*=\s*(["'])(.*?)\1[^>]*\?>/i.exec(xml);
  if (declaration && !/^utf-?8$/i.test(declaration[2] ?? "")) return null;
  if (/<!doctype\b|<!entity\b/i.test(xml)) return null;
  if (/&(?!(?:#x[0-9a-f]+|#\d+|amp|apos|gt|lt|quot);)/i.test(xml)) return null;
  return xml;
}

function hasXmlElement(xml: string, localName: string): boolean {
  return new RegExp(`<\\s*(?:[a-z_][\\w.-]*:)?${localName}(?:\\s|/|>)`, "i").test(xml);
}

function inspectXmlPart(name: string, xml: string, report: CompatibilityReportBuilder): void {
  const normalized = decodeXmlEntities(xml);
  const externalRelationship = /<Relationship\b([^>]*)\/?\s*>/gi;
  const hasExternalNonHyperlinkRelationship = [...normalized.matchAll(externalRelationship)].some(
    (entry) => {
      const attrs = entry[1] ?? "";
      const targetMode = /\bTargetMode\s*=\s*(["'])External\1/i.test(attrs);
      const isHyperlink = /\bType\s*=\s*(["'])[^"']*\/hyperlink\1/i.test(attrs);
      return targetMode && !isHyperlink;
    },
  );
  if (hasExternalNonHyperlinkRelationship) report.add("external-content", "block", name);
  if (/macroenabled|vbaproject|oleobject|activex|embeddedpackage/i.test(normalized))
    report.add("macro-content", "block", name);

  const workbookPart = name.toLowerCase() === "xl/workbook.xml";
  if (workbookPart && ["fileSharing"].some((feature) => hasXmlElement(xml, feature)))
    report.add("feature-omitted", "warning", name);
}

async function verifyActualUncompressedSize(
  entry: ZipEntry,
  bytes: Uint8Array,
  signal: AbortSignalLike | undefined,
  capture: boolean,
): Promise<Uint8Array | undefined> {
  assertNotAborted(signal);
  const compressed = bytes.slice(
    entry.compressedOffset,
    entry.compressedOffset + entry.compressedSize,
  );
  if (entry.compression === 0) {
    if (compressed.byteLength !== entry.uncompressedSize)
      throw new Error("Stored entry size mismatch.");
    return capture ? compressed : undefined;
  }
  const Constructor = (
    globalThis as unknown as {
      DecompressionStream?: new (format: string) => {
        writable: {
          getWriter: () => {
            write: (value: Uint8Array) => Promise<void>;
            close: () => Promise<void>;
            abort: (reason?: unknown) => Promise<void>;
          };
        };
        readable: {
          getReader: () => {
            read: () => Promise<{ done: boolean; value?: Uint8Array }>;
            cancel: (reason?: unknown) => Promise<void>;
          };
        };
      };
    }
  ).DecompressionStream;
  if (!Constructor) throw new Error("Deflate verification is unavailable.");
  const stream = new Constructor("deflate-raw");
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();
  const write = writer.write(compressed).then(() => writer.close());
  void write.catch(() => undefined);
  let actualSize = 0;
  const captured: Uint8Array[] = [];
  try {
    while (true) {
      assertNotAborted(signal);
      const chunk = await reader.read();
      if (chunk.done) break;
      const value = chunk.value ?? new Uint8Array();
      actualSize += value.byteLength;
      if (actualSize > MAX_ENTRY_UNCOMPRESSED_BYTES || actualSize > entry.uncompressedSize)
        throw new Error("Deflated entry exceeds its declared size.");
      if (capture) captured.push(value);
    }
    await write;
  } catch (error) {
    await Promise.allSettled([reader.cancel(error), writer.abort(error), write]);
    throw error;
  }
  if (actualSize !== entry.uncompressedSize) throw new Error("Deflated entry size mismatch.");
  if (!capture) return undefined;
  const result = new Uint8Array(actualSize);
  let offset = 0;
  for (const chunk of captured) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

/**
 * Checks ZIP structure and verifies every entry's actual inflated byte count before ExcelJS loads it.
 * It bounds ordinary ZIP bombs, but malformed compression implementations still require worker isolation.
 */
export async function preflightXlsxArchive(
  bytes: Uint8Array,
  signal?: AbortSignalLike,
): Promise<XlsxCompatibilityReport> {
  const report = new CompatibilityReportBuilder();
  assertNotAborted(signal);
  if (bytes.byteLength < 22 || bytes.byteLength > MAX_ARCHIVE_BYTES) fail("archive-limit", report);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOffset = findEndOfCentralDirectory(view);
  if (eocdOffset === null) fail("archive-invalid", report);
  const disk = view.getUint16(eocdOffset + 4, true);
  const directoryDisk = view.getUint16(eocdOffset + 6, true);
  const entries = view.getUint16(eocdOffset + 10, true);
  const directorySize = view.getUint32(eocdOffset + 12, true);
  const directoryOffset = view.getUint32(eocdOffset + 16, true);
  if (
    disk !== 0 ||
    directoryDisk !== 0 ||
    entries === 0xffff ||
    directorySize === 0xffffffff ||
    directoryOffset === 0xffffffff
  )
    fail("archive-invalid", report);
  if (entries < 1 || entries > MAX_ENTRIES || directoryOffset + directorySize > eocdOffset)
    fail("archive-limit", report);

  const archiveEntries: ZipEntry[] = [];
  let cursor = directoryOffset;
  let totalUncompressed = 0;
  for (let index = 0; index < entries; index += 1) {
    assertNotAborted(signal);
    if (
      cursor + 46 > directoryOffset + directorySize ||
      view.getUint32(cursor, true) !== CENTRAL_DIRECTORY_SIGNATURE
    )
      fail("archive-invalid", report);
    const flags = view.getUint16(cursor + 8, true);
    const compression = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const recordEnd = cursor + 46 + nameLength + extraLength + commentLength;
    if (
      recordEnd > directoryOffset + directorySize ||
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      localOffset === 0xffffffff
    )
      fail("archive-invalid", report);
    const name = readAscii(bytes, cursor + 46, nameLength);
    if (isUnsafePath(name)) fail("archive-unsafe-path", report, name);
    if ((flags & 1) !== 0) fail("archive-encrypted", report, name);
    if (compression !== 0 && compression !== 8)
      fail("archive-unsupported-compression", report, name);
    if (
      uncompressedSize > MAX_ENTRY_UNCOMPRESSED_BYTES ||
      totalUncompressed + uncompressedSize > MAX_TOTAL_UNCOMPRESSED_BYTES
    )
      fail("archive-limit", report, name);
    if (
      localOffset + 30 > bytes.byteLength ||
      view.getUint32(localOffset, true) !== LOCAL_FILE_SIGNATURE
    )
      fail("archive-invalid", report, name);
    const localFlags = view.getUint16(localOffset + 6, true);
    const localCompression = view.getUint16(localOffset + 8, true);
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const compressedOffset = localOffset + 30 + localNameLength + localExtraLength;
    if (
      (localFlags & 1) !== 0 ||
      localCompression !== compression ||
      compressedOffset + compressedSize > bytes.byteLength
    )
      fail("archive-invalid", report, name);
    if (readAscii(bytes, localOffset + 30, localNameLength) !== name)
      fail("archive-invalid", report, name);
    archiveEntries.push({
      name,
      compression,
      compressedOffset,
      compressedSize,
      uncompressedSize,
    });
    totalUncompressed += uncompressedSize;
    cursor = recordEnd;
  }
  if (cursor !== directoryOffset + directorySize) fail("archive-invalid", report);
  const inspectedContents = new Map<string, Uint8Array>();
  for (const entry of archiveEntries) {
    try {
      const lowerName = entry.name.toLowerCase();
      const inspect =
        lowerName === "[content_types].xml" ||
        lowerName.endsWith(".rels") ||
        lowerName === "xl/workbook.xml" ||
        /^xl\/pivot[^/]*\/[^/]+\.xml$/.test(lowerName) ||
        /^xl\/worksheets\/[^/]+\.xml$/.test(lowerName);
      const content = await verifyActualUncompressedSize(entry, bytes, signal, inspect);
      if (content) inspectedContents.set(entry.name.toLowerCase(), content);
    } catch (error) {
      if (error instanceof XlsxAbortError) throw error;
      fail("archive-invalid", report, entry.name);
    }
  }
  const materialEntries = archiveEntries.filter(
    (entry) =>
      !(entry.name.endsWith("/") && entry.compressedSize === 0 && entry.uncompressedSize === 0),
  );
  const names = new Set(materialEntries.map((entry) => entry.name.toLowerCase()));
  if ([...names].some((name) => name === "xl/vbaproject.bin" || name.endsWith(".xlsm")))
    fail("macro-content", report);
  if (
    [...names].some(
      (name) =>
        (!name.endsWith("/") &&
          name.startsWith("xl/drawings/") &&
          !/^xl\/drawings\/vmldrawing\d+\.vml$/i.test(name)) ||
        name.startsWith("xl/media/"),
    )
  )
    fail("drawing-or-media", report);
  if (
    [...names].some(
      (name) => name.startsWith("xl/externallinks/") || name.includes("encryptedpackage"),
    )
  )
    fail("external-content", report);
  for (const [name, content] of inspectedContents) {
    const xml = decodeXml(content);
    if (xml === null) fail("archive-invalid", report, name);
    inspectXmlPart(name, xml, report);
  }
  for (const entry of materialEntries) {
    const name = entry.name.toLowerCase();
    if (name.startsWith("xl/embeddings/") || name.startsWith("xl/activex/"))
      report.add("macro-content", "block", entry.name);
    if (
      name.startsWith("xl/tables/") ||
      name.startsWith("xl/charts") ||
      name.startsWith("customxml/") ||
      name.startsWith("xl/connections")
    )
      report.add("feature-omitted", "warning", entry.name);
    const knownPart =
      name === "[content_types].xml" ||
      name === "_rels/.rels" ||
      name.startsWith("docprops/") ||
      name === "xl/workbook.xml" ||
      name === "xl/styles.xml" ||
      name === "xl/sharedstrings.xml" ||
      name === "xl/calcchain.xml" ||
      name.startsWith("xl/_rels/") ||
      name.startsWith("xl/worksheets/") ||
      name.startsWith("xl/theme/") ||
      /^xl\/drawings\/vmldrawing\d+\.vml$/i.test(name) ||
      name.startsWith("xl/tables/") ||
      name.startsWith("xl/comments") ||
      name.startsWith("xl/pivot") ||
      name.startsWith("xl/charts") ||
      name.startsWith("xl/connections") ||
      name.startsWith("customxml/");
    if (!knownPart) report.add("feature-omitted", "warning", entry.name);
  }
  if (report.hasBlocks())
    throw new XlsxCompatibilityError(
      "The XLSX archive contains unsupported content.",
      report.build(),
    );
  return report.build();
}
