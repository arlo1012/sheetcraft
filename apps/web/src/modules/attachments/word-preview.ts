import { unzipSync } from "fflate";
import type { SheetAttachment } from "@sheetcraft/core/sheet-attachments";
import { decodeAttachmentBytes } from "./attachment-file";

export type WordAttachmentPreview = { html: string; width: number };
const previews = new WeakMap<SheetAttachment, Promise<WordAttachmentPreview | undefined>>();
const wordMime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function isWordAttachment(attachment: SheetAttachment) {
  return attachment.mimeType === wordMime || /\.docx$/i.test(attachment.filename);
}

function pixels(length: string): number {
  const value = Number.parseFloat(length);
  return Number.isFinite(value) ? value * (length.endsWith("pt") ? 4 / 3 : 1) : 0;
}

async function renderWordPreview(
  attachment: SheetAttachment,
): Promise<WordAttachmentPreview | undefined> {
  try {
    const bytes = decodeAttachmentBytes(attachment.data);
    // Read ZIP directory sizes without inflating entries before handing the document to the renderer.
    let expanded = 0,
      parts = 0;
    unzipSync(bytes, {
      filter(entry) {
        expanded += entry.originalSize;
        if (
          ++parts > 4096 ||
          expanded > 64 * 1024 * 1024 ||
          (/\.(?:xml|rels)$/i.test(entry.name) && entry.originalSize > 8 * 1024 * 1024)
        )
          throw new RangeError("Document exceeds the embedded preview size.");
        return false;
      },
    });
    const { renderAsync } = await import("docx-preview");
    const content = document.createElement("div"),
      styles = document.createElement("div");
    await renderAsync(bytes, content, styles, {
      className: "embedded-word",
      inWrapper: false,
      breakPages: false,
      ignoreHeight: true,
      ignoreFonts: true,
      renderHeaders: false,
      renderFooters: false,
      renderAltChunks: false,
      useBase64URL: true,
    });
    const section = content.querySelector<HTMLElement>("section.embedded-word");
    if (!section) return;
    const width =
      pixels(section.style.width) -
      pixels(section.style.paddingLeft) -
      pixels(section.style.paddingRight);
    // The embedded document is a passive preview. Its links are text until opened in a document editor.
    for (const link of content.querySelectorAll("a")) {
      link.removeAttribute("href");
      link.removeAttribute("target");
      link.removeAttributeNS("http://www.w3.org/1999/xlink", "href");
    }
    const sheetStyles = [...styles.querySelectorAll("style")]
      .map((style) => style.textContent.replaceAll("<", "\\3c "))
      .join("\n");
    const html = `<!doctype html><html><head><meta charset="utf-8">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'">
      <style>${sheetStyles}</style><style>
        html,body{margin:0;background:#fff;color:#111;}
        body>section.embedded-word{padding:0!important;margin:0!important;width:100%!important;min-height:0!important;box-shadow:none;overflow-wrap:break-word;}
        img,svg{max-width:100%;}
      </style></head><body>${content.innerHTML}</body></html>`;
    return { html, width: width > 0 ? Math.round(width) : 360 };
  } catch {
    // An encrypted, damaged or unsupported package remains a downloadable attachment.
    return undefined;
  }
}

export function readWordAttachmentPreview(
  attachment: SheetAttachment,
): Promise<WordAttachmentPreview | undefined> {
  if (!isWordAttachment(attachment)) return Promise.resolve(undefined);
  let result = previews.get(attachment);
  if (!result) {
    result = renderWordPreview(attachment);
    previews.set(attachment, result);
  }
  return result;
}

export async function wordAttachmentDimensions(attachment: SheetAttachment) {
  if (attachment.display !== "document") return;
  const preview = await readWordAttachmentPreview(attachment);
  if (!preview) return;
  const frame = document.createElement("iframe");
  frame.tabIndex = -1;
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("sandbox", "allow-same-origin");
  frame.style.cssText = `position:fixed;visibility:hidden;pointer-events:none;left:0;top:0;border:0;width:${preview.width}px;height:1px`;
  try {
    await new Promise<void>((resolve, reject) => {
      frame.onload = () => resolve();
      frame.onerror = () => reject(new Error("Unable to measure document preview."));
      frame.srcdoc = preview.html;
      document.body.append(frame);
    });
    // Embed at content height, up to one 11-inch page. The viewer scrolls the full document.
    const height = frame.contentDocument?.body.scrollHeight;
    return height
      ? { width: preview.width, height: Math.max(24, Math.min(1056, Math.ceil(height))) }
      : undefined;
  } catch {
    return undefined;
  } finally {
    frame.remove();
  }
}
