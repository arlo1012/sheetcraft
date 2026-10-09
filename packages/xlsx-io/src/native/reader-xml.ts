import { strFromU8, unzipSync } from "fflate/browser";
import { attr, child, nodes, parseXml, type XmlNode } from "../pivot-xml.js";

const MAX_ARCHIVE_BYTES = 25 * 1024 * 1024;
const MAX_PART_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;

/** The public import path additionally verifies actual deflate sizes in ZIP preflight. */
export function readArchive(bytes: Uint8Array): Record<string, Uint8Array> {
  if (bytes.byteLength < 22 || bytes.byteLength > MAX_ARCHIVE_BYTES)
    throw new Error("The XLSX archive exceeds the supported size.");
  const sizes = new Map<string, number>();
  let total = 0;
  const entries = unzipSync(bytes, {
    filter: (file) => {
      if (
        !file.name ||
        file.name.startsWith("/") ||
        file.name.includes("\\") ||
        file.name.includes("\0") ||
        file.name.split("/").includes("..") ||
        sizes.has(file.name) ||
        sizes.size >= 2_000 ||
        file.originalSize > MAX_PART_BYTES ||
        (total += file.originalSize) > MAX_TOTAL_BYTES
      )
        throw new Error("Invalid or oversized XLSX archive part.");
      sizes.set(file.name, file.originalSize);
      return true;
    },
  });
  for (const [name, data] of Object.entries(entries)) {
    if (data.byteLength !== sizes.get(name)) throw new Error("Invalid XLSX archive part size.");
    if (/\.(?:xml|rels)$/i.test(name)) {
      const parsedXml = readXml(data);
      if (/\.rels$/i.test(name)) {
        for (const relationship of nodes(child(parsedXml, "Relationships").Relationship)) {
          if (
            attr(relationship, "TargetMode").toLowerCase() === "external" &&
            !attr(relationship, "Type").endsWith("/hyperlink")
          )
            throw new Error("External XLSX content is not supported.");
        }
      }
    }
  }
  return entries;
}

export function readXml(bytes: Uint8Array | undefined): XmlNode {
  if (!bytes) throw new Error("Missing XLSX XML part.");
  if (bytes.byteLength > MAX_PART_BYTES) throw new Error("Oversized XLSX XML part.");
  const Decoder = (
    globalThis as unknown as {
      TextDecoder?: new (
        encoding: string,
        options: { fatal: boolean },
      ) => { decode(bytes: Uint8Array): string };
    }
  ).TextDecoder;
  const source = Decoder ? new Decoder("utf-8", { fatal: true }).decode(bytes) : strFromU8(bytes);
  if (
    // eslint-disable-next-line no-control-regex -- XML 1.0 forbids these literal control bytes.
    /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(source) ||
    /^\s*<\?xml\s+[^>]*encoding\s*=\s*(["'])(?!utf-?8\1)[^"']+\1/i.test(source) ||
    /&(?!(?:#x[0-9a-f]+|#\d+|amp|apos|gt|lt|quot);)/i.test(source)
  )
    throw new Error("Unsupported XLSX XML encoding.");
  for (const match of source.matchAll(/&#(x[0-9a-f]+|\d+);/gi)) {
    const token = match[1]!;
    const point = Number.parseInt(
      token.startsWith("x") ? token.slice(1) : token,
      token.startsWith("x") ? 16 : 10,
    );
    if (
      !(
        point === 9 ||
        point === 10 ||
        point === 13 ||
        (point >= 0x20 && point <= 0xd7ff) ||
        (point >= 0xe000 && point <= 0xfffd) ||
        (point >= 0x10000 && point <= 0x10ffff)
      )
    )
      throw new Error("Invalid XLSX XML character reference.");
  }
  let depth = 0;
  for (const token of source.matchAll(
    /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<\/?([a-z_][\w.:-]*)\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi,
  )) {
    if (!token[1]) continue;
    if (token[0].startsWith("</")) depth--;
    else if (!token[0].endsWith("/>")) depth++;
    if (depth > 128) throw new Error("The XLSX XML nesting limit was exceeded.");
  }
  return parseXml(bytes);
}

export function textValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value && typeof value === "object") return textValue((value as XmlNode)["#text"]);
  return "";
}

/** Single pass also preserves literal escaped strings such as _x005F_x0041_. */
export function decodeSpreadsheetText(value: string): string {
  return value.replace(/_x([0-9a-f]{4})_/gi, (_, digits: string) =>
    String.fromCharCode(Number.parseInt(digits, 16)),
  );
}

export function richText(value: unknown): string {
  const node = value && typeof value === "object" ? (value as XmlNode) : {};
  const runs = Array.isArray(node.r) ? node.r : node.r === undefined ? [] : [node.r];
  const text = runs.length
    ? runs.map((run) => textValue((run as XmlNode).t)).join("")
    : textValue(node.t);
  return decodeSpreadsheetText(text);
}

/** OOXML indexed tables must retain empty elements, including <font/> and <xf/>. */
export function elements(value: unknown): XmlNode[] {
  if (value === undefined || value === null) return [];
  return (Array.isArray(value) ? value : [value]).map((node) =>
    node && typeof node === "object" ? (node as XmlNode) : {},
  );
}
