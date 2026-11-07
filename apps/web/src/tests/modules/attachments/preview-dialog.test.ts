// 未执行：按用户要求仅编写测试，不运行检查。
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import { Dialog } from "tdesign-vue-next/es/dialog";
import type { SheetAttachmentDrawing } from "@sheetcraft/core/sheet-drawings";
import type { SheetAttachment } from "@sheetcraft/core/sheet-attachments";
import AttachmentDialog from "../../../modules/attachments/components/AttachmentDialog.vue";
import { ATTACHMENT_TEXT_PREVIEW_BYTES } from "../../../modules/attachments/attachment-file";
import { attachmentsEnUS } from "../../../modules/attachments/attachment-messages.en-US";
import { createAppI18n } from "../../../shared/i18n";

const mounted: Array<{ unmount(): void }> = [];
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.replaceChildren();
});
const notice = attachmentsEnUS["attachment.previewTruncated"];

function drawing(
  bytes: Uint8Array,
  filename = "report.txt",
  mimeType = "text/plain",
): SheetAttachmentDrawing {
  let raw = "";
  for (let offset = 0; offset < bytes.length; offset += 8192)
    raw += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  const attachment: SheetAttachment = {
    filename,
    mimeType,
    size: bytes.length,
    data: btoa(raw),
    display: "document",
  };
  return {
    id: "attachment",
    kind: "attachment",
    name: "Attachment",
    anchor: { row: 0, column: 0 },
    offsetX: 0,
    offsetY: 0,
    width: 360,
    height: 240,
    text: "",
    shape: "rectangle",
    fill: "#ffffff",
    stroke: "#000000",
    strokeWidth: 1,
    color: "#000000",
    fontSize: 14,
    bold: false,
    italic: false,
    rotation: 0,
    attachment,
  };
}

function fixture(value: SheetAttachmentDrawing) {
  const wrapper = mount(AttachmentDialog, {
    attachTo: document.body,
    props: { drawing: value },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  return wrapper;
}

function preview() {
  return document.body.querySelector(".attachment-dialog pre");
}

describe("attachment text preview dialog", () => {
  test("exposes a modal dialog named by its filename and retains download and close events", async () => {
    const value = drawing(new TextEncoder().encode("报告😀"));
    const before = structuredClone(value);
    const wrapper = fixture(value);
    await flushPromises();
    const modal = document.body.querySelector('[role="dialog"][aria-label="report.txt"]');

    expect(modal).not.toBeNull();
    expect(modal?.getAttribute("aria-modal")).toBe("true");
    expect(preview()?.textContent).toBe("报告😀");
    expect(wrapper.getComponent(Dialog).props("confirmBtn")).toBe("Download file");
    wrapper.getComponent(Dialog).vm.$emit("confirm");
    expect(wrapper.emitted("download")).toEqual([[]]);
    wrapper.getComponent(Dialog).vm.$emit("close");
    expect(wrapper.emitted("close")).toEqual([[]]);
    expect(value).toEqual(before);
  });

  test.each([
    { filename: "large.txt", mimeType: "text/plain" },
    { filename: "events.LOG", mimeType: "application/octet-stream" },
  ])(
    "shows the truncation notice only with a bounded text preview for $filename",
    async ({ filename, mimeType }) => {
      const value = drawing(
        new Uint8Array(ATTACHMENT_TEXT_PREVIEW_BYTES + 1).fill(65),
        filename,
        mimeType,
      );
      const before = structuredClone(value.attachment);
      fixture(value);
      await flushPromises();

      expect(preview()?.textContent).toBe("A".repeat(ATTACHMENT_TEXT_PREVIEW_BYTES));
      expect(document.body.textContent).toContain(notice);
      expect(value.attachment).toEqual(before);
    },
  );

  test.each([0, ATTACHMENT_TEXT_PREVIEW_BYTES])(
    "shows no truncation notice for a complete %s-byte text file",
    async (size) => {
      fixture(drawing(new Uint8Array(size).fill(65)));
      await flushPromises();

      expect(preview()).not.toBeNull();
      expect(preview()?.textContent).toBe("A".repeat(size));
      expect(document.body.textContent).not.toContain(notice);
    },
  );

  test("shows metadata without a text or truncation preview for an oversized binary file", async () => {
    fixture(
      drawing(
        new Uint8Array(ATTACHMENT_TEXT_PREVIEW_BYTES + 1).fill(65),
        "payload.bin",
        "application/octet-stream",
      ),
    );
    await flushPromises();

    expect(preview()).toBeNull();
    expect(document.body.textContent).toContain("application/octet-stream");
    expect(document.body.textContent).not.toContain(notice);
  });

  test("removes stale preview text and its notice when the displayed attachment changes format", async () => {
    const bytes = new Uint8Array(ATTACHMENT_TEXT_PREVIEW_BYTES + 1).fill(65);
    const wrapper = fixture(drawing(bytes));
    await flushPromises();
    expect(document.body.textContent).toContain(notice);

    await wrapper.setProps({ drawing: drawing(bytes, "payload.bin", "application/octet-stream") });
    await flushPromises();
    expect(preview()).toBeNull();
    expect(document.body.textContent).not.toContain(notice);
    await wrapper.setProps({ drawing: drawing(new Uint8Array(), "empty.txt") });
    await flushPromises();
    expect(preview()).not.toBeNull();
    expect(preview()?.textContent).toBe("");
    expect(document.body.textContent).not.toContain(notice);
  });
});
