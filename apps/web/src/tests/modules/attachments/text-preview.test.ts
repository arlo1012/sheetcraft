// 未执行：按用户要求仅编写测试，不运行检查。
import { describe, expect, test } from "vitest";
import type { SheetAttachment } from "@sheetcraft/core/sheet-attachments";
import {
  ATTACHMENT_TEXT_PREVIEW_BYTES,
  attachmentBlob,
  attachmentText,
  prepareAttachment,
} from "../../../modules/attachments/attachment-file";

function attachment(
  bytes: Uint8Array,
  filename = "preview.txt",
  mimeType = "text/plain",
): SheetAttachment {
  let raw = "";
  for (let offset = 0; offset < bytes.length; offset += 8192)
    raw += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return { filename, mimeType, size: bytes.length, data: btoa(raw), display: "document" };
}

function utf16(text: string, littleEndian: boolean) {
  const bytes = new Uint8Array(2 + text.length * 2);
  bytes.set(littleEndian ? [0xff, 0xfe] : [0xfe, 0xff]);
  for (let index = 0; index < text.length; index++) {
    const unit = text.charCodeAt(index),
      offset = 2 + index * 2;
    bytes[offset] = littleEndian ? unit & 255 : unit >>> 8;
    bytes[offset + 1] = littleEndian ? unit >>> 8 : unit & 255;
  }
  return bytes;
}

describe("bounded attachment text decoding", () => {
  test("exports the byte limit and returns empty text separately from unsupported binary content", () => {
    expect(ATTACHMENT_TEXT_PREVIEW_BYTES).toBe(120000);
    expect(attachmentText(attachment(new Uint8Array()))).toBe("");
    expect(
      attachmentText(
        attachment(new Uint8Array([0, 255, 1, 128]), "payload.bin", "application/octet-stream"),
      ),
    ).toBeUndefined();
    expect(
      attachmentText(
        attachment(new TextEncoder().encode("中文😀"), "events.LOG", "application/octet-stream"),
      ),
    ).toBe("中文😀");
  });

  test.each([
    { character: "中", partialBytes: 1 },
    { character: "中", partialBytes: 2 },
    { character: "😀", partialBytes: 1 },
    { character: "😀", partialBytes: 2 },
    { character: "😀", partialBytes: 3 },
  ])(
    "omits UTF-8 $character when the preview ends after $partialBytes of its bytes",
    ({ character, partialBytes }) => {
      const prefix = "a".repeat(ATTACHMENT_TEXT_PREVIEW_BYTES - partialBytes);
      const value = attachment(new TextEncoder().encode(`${prefix}${character}尾`));
      const before = structuredClone(value);

      expect(attachmentText(value)).toBe(prefix);
      expect(value).toEqual(before);
    },
  );

  test.each(["中", "😀"])(
    "keeps a complete final UTF-8 %s at the exact preview byte boundary",
    (character) => {
      const prefix = "a".repeat(
        ATTACHMENT_TEXT_PREVIEW_BYTES - new TextEncoder().encode(character).length,
      );
      const value = attachment(new TextEncoder().encode(prefix + character));
      expect(value.size).toBe(ATTACHMENT_TEXT_PREVIEW_BYTES);
      expect(attachmentText(value)).toBe(prefix + character);
    },
  );

  test("flushes a complete UTF-8 file normally and removes its optional BOM", () => {
    const text = new TextEncoder().encode("报告😀尾");
    const withBom = new Uint8Array(text.length + 3);
    withBom.set([0xef, 0xbb, 0xbf]);
    withBom.set(text, 3);
    expect(attachmentText(attachment(withBom))).toBe("报告😀尾");
    // A complete malformed file must flush its pending sequence, whereas a
    // deliberately truncated preview must leave an incomplete sequence unseen.
    expect(attachmentText(attachment(new Uint8Array([65, 0xf0, 0x9f])))).toBe("A\uFFFD");
  });

  test.each([true, false])(
    "reads BOM-marked UTF-16 with Chinese and a complete surrogate pair, littleEndian=%s",
    (littleEndian) => {
      expect(attachmentText(attachment(utf16("报告😀尾", littleEndian)))).toBe("报告😀尾");
    },
  );

  test.each([true, false])(
    "drops a UTF-16 surrogate pair split by the byte limit, littleEndian=%s",
    (littleEndian) => {
      const prefix = "a".repeat((ATTACHMENT_TEXT_PREVIEW_BYTES - 2) / 2 - 1);
      const value = attachment(utf16(`${prefix}😀尾`, littleEndian));
      expect(value.size).toBeGreaterThan(ATTACHMENT_TEXT_PREVIEW_BYTES);
      expect(attachmentText(value)).toBe(prefix);
    },
  );

  test.each([
    { littleEndian: true, character: "中" },
    { littleEndian: false, character: "中" },
    { littleEndian: true, character: "😀" },
    { littleEndian: false, character: "😀" },
  ])(
    "keeps a complete UTF-16 $character at the limit before truncation, littleEndian=$littleEndian",
    ({ littleEndian, character }) => {
      const prefix = "a".repeat((ATTACHMENT_TEXT_PREVIEW_BYTES - 2) / 2 - character.length);
      const value = attachment(utf16(`${prefix}${character}尾`, littleEndian));
      expect(value.size).toBeGreaterThan(ATTACHMENT_TEXT_PREVIEW_BYTES);
      expect(attachmentText(value)).toBe(prefix + character);
    },
  );

  test("preserves the original attachment and every downloadable byte after decoding a bounded preview", async () => {
    const bytes = utf16(`报告😀${"a".repeat(61000)}尾`, false);
    const original = bytes.slice();
    const value = await prepareAttachment(
      new File([bytes], "original.txt", { type: "text/plain" }),
      "document",
    );
    const before = structuredClone(value);
    const preview = attachmentText(value)!;

    expect(preview.startsWith("报告😀")).toBe(true);
    expect(value.size).toBeGreaterThan(ATTACHMENT_TEXT_PREVIEW_BYTES);
    expect(value).toEqual(before);
    expect(bytes).toEqual(original);
    const downloaded = attachmentBlob(value);
    expect(downloaded.size).toBe(original.length);
    expect(new Uint8Array(await downloaded.arrayBuffer())).toEqual(original);
  });
});
