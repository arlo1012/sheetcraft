import { describe, expect, test } from "vitest";
import { MAX_ATTACHMENT_BYTES } from "@sheetcraft/core/sheet-attachments";
import {
  prepareAttachment,
  attachmentBlob,
  attachmentText,
} from "../../../modules/attachments/attachment-file";

describe("attachment files", () => {
  test("round trips arbitrary bytes without altering MIME metadata", async () => {
    const bytes = Uint8Array.from([0, 1, 127, 128, 255]);
    const attachment = await prepareAttachment(
      new File([bytes], "data.bin", { type: "application/octet-stream" }),
      "icon",
    );
    expect(attachment).toMatchObject({ filename: "data.bin", size: 5, display: "icon" });
    const blob = attachmentBlob(attachment);
    expect(blob.type).toBe("application/octet-stream");
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes);
    expect(attachmentText(attachment)).toBeUndefined();
  });
  test("previews UTF-8 text and text extensions with an unknown MIME", async () => {
    for (const type of ["text/plain", ""])
      expect(
        attachmentText(
          await prepareAttachment(new File(["报告 <tag> & 😀"], "report.md", { type }), "document"),
        ),
      ).toBe("报告 <tag> & 😀");
  });
  test("normalizes path separators and falls back to binary MIME", async () => {
    const attachment = await prepareAttachment(
      new File(["x"], "a/b\\c.txt", { type: "invalid" }),
      "icon",
    );
    expect(attachment.filename).toBe("a_b_c.txt");
    expect(attachment.mimeType).toBe("application/octet-stream");
  });
  test("rejects oversized files before reading their contents", async () => {
    const file = new File([new Uint8Array(MAX_ATTACHMENT_BYTES + 1)], "large.bin");
    await expect(prepareAttachment(file, "icon")).rejects.toThrow("too large");
  });
});
