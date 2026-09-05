import type { FloatingImage } from "@idea10/core/workbook";
import {
  FLOATING_IMAGE_CLIPBOARD_TYPE,
  readFloatingImageClipboard,
} from "../sheet-images/imageClipboard";
export const IDEA10_CLIPBOARD_TYPE = "application/x-idea10-cells";
export const WEB_IDEA10_CLIPBOARD_TYPE = `web ${IDEA10_CLIPBOARD_TYPE}`;
export const WEB_FLOATING_IMAGE_CLIPBOARD_TYPE = `web ${FLOATING_IMAGE_CLIPBOARD_TYPE}`;

export type GridClipboardTransfer = {
  text?: string;
  localToken?: string;
  imageFile?: File;
  floatingImage?: FloatingImage;
};

export type GridClipboardWriteResult = {
  localTokenWritten: boolean;
};

export type GridClipboardReadOptions = {
  preferAsync?: boolean;
};

export type GridClipboardPort = {
  write: (transfer: {
    text: string;
    localToken: string;
    floatingImage?: FloatingImage;
  }) => Promise<GridClipboardWriteResult>;
  /** Add an Async Clipboard custom format after a native copy/cut, without text-only fallback. */
  writeNativeRich?: (transfer: {
    text: string;
    localToken: string;
    floatingImage?: FloatingImage;
  }) => Promise<void>;
  read: (options?: GridClipboardReadOptions) => Promise<GridClipboardTransfer>;
};

export function areGridClipboardTextsEqual(
  left: string | undefined,
  right: string | undefined,
): boolean {
  return (
    left !== undefined &&
    right !== undefined &&
    left.replace(/\r\n?/g, "\n") === right.replace(/\r\n?/g, "\n")
  );
}

export function readGridClipboardLocalToken(
  data: Pick<DataTransfer, "getData">,
): string | undefined {
  return (
    data.getData(IDEA10_CLIPBOARD_TYPE) || data.getData(WEB_IDEA10_CLIPBOARD_TYPE) || undefined
  );
}

function restoreFocus(element: HTMLElement | null): void {
  if (element?.isConnected) {
    element.focus({ preventScroll: true });
  }
}

function createClipboardProxy(): HTMLTextAreaElement {
  const proxy = document.createElement("textarea");
  proxy.tabIndex = -1;
  proxy.setAttribute("aria-hidden", "true");
  proxy.style.position = "fixed";
  proxy.style.left = "-10000px";
  proxy.style.top = "0";
  proxy.style.opacity = "0";
  document.body.append(proxy);
  return proxy;
}

function writeWithClipboardEvent(transfer: {
  text: string;
  localToken: string;
  floatingImage?: FloatingImage;
}): boolean {
  if (typeof document === "undefined" || typeof document.execCommand !== "function") {
    return false;
  }

  const previousFocus =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const proxy = createClipboardProxy();
  let handled = false;
  const onCopy = (event: ClipboardEvent) => {
    if (!event.clipboardData) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    event.clipboardData.setData("text/plain", transfer.text);
    event.clipboardData.setData(IDEA10_CLIPBOARD_TYPE, transfer.localToken);
    if (transfer.floatingImage)
      event.clipboardData.setData(
        FLOATING_IMAGE_CLIPBOARD_TYPE,
        JSON.stringify(transfer.floatingImage),
      );
    handled = true;
  };

  try {
    document.addEventListener("copy", onCopy, true);
    proxy.value = transfer.text;
    proxy.focus({ preventScroll: true });
    proxy.select();
    document.execCommand("copy");
    return handled;
  } catch {
    return false;
  } finally {
    document.removeEventListener("copy", onCopy, true);
    proxy.remove();
    restoreFocus(previousFocus);
  }
}

function readWithClipboardEvent(): GridClipboardTransfer | undefined {
  if (typeof document === "undefined" || typeof document.execCommand !== "function") {
    return undefined;
  }

  const previousFocus =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const proxy = createClipboardProxy();
  let transfer: GridClipboardTransfer | undefined;
  const onPaste = (event: ClipboardEvent) => {
    if (!event.clipboardData) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    const types = Array.from(event.clipboardData.types);
    transfer = {
      text: types.includes("text/plain") ? event.clipboardData.getData("text/plain") : undefined,
      localToken: readGridClipboardLocalToken(event.clipboardData),
      imageFile: event.clipboardData.files
        ? Array.from(event.clipboardData.files).find((file) => file.type.startsWith("image/"))
        : undefined,
      floatingImage: readFloatingImageClipboard(event.clipboardData),
    };
  };

  try {
    document.addEventListener("paste", onPaste, true);
    proxy.focus({ preventScroll: true });
    document.execCommand("paste");
    return transfer;
  } catch {
    return undefined;
  } finally {
    document.removeEventListener("paste", onPaste, true);
    proxy.remove();
    restoreFocus(previousFocus);
  }
}

async function writeWithAsyncClipboard(transfer: {
  text: string;
  localToken: string;
  floatingImage?: FloatingImage;
}): Promise<void> {
  if (
    typeof navigator === "undefined" ||
    !navigator.clipboard ||
    typeof ClipboardItem === "undefined"
  ) {
    throw new Error("clipboard-unavailable");
  }

  const item = new ClipboardItem({
    "text/plain": new Blob([transfer.text], { type: "text/plain" }),
    [WEB_IDEA10_CLIPBOARD_TYPE]: new Blob([transfer.localToken], { type: IDEA10_CLIPBOARD_TYPE }),
    ...(transfer.floatingImage
      ? {
          [WEB_FLOATING_IMAGE_CLIPBOARD_TYPE]: new Blob([JSON.stringify(transfer.floatingImage)], {
            type: FLOATING_IMAGE_CLIPBOARD_TYPE,
          }),
        }
      : {}),
  });
  await navigator.clipboard.write([item]);
}

async function readWithAsyncClipboard(): Promise<GridClipboardTransfer> {
  if (typeof navigator === "undefined" || !navigator.clipboard) {
    throw new Error("clipboard-unavailable");
  }

  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const textType = item.types.includes("text/plain") ? "text/plain" : undefined;
      const tokenType = item.types.includes(WEB_IDEA10_CLIPBOARD_TYPE)
        ? WEB_IDEA10_CLIPBOARD_TYPE
        : item.types.includes(IDEA10_CLIPBOARD_TYPE)
          ? IDEA10_CLIPBOARD_TYPE
          : undefined;
      const imageType = item.types.find((type) => type.startsWith("image/"));
      const floatingType = item.types.includes(WEB_FLOATING_IMAGE_CLIPBOARD_TYPE)
        ? WEB_FLOATING_IMAGE_CLIPBOARD_TYPE
        : item.types.includes(FLOATING_IMAGE_CLIPBOARD_TYPE)
          ? FLOATING_IMAGE_CLIPBOARD_TYPE
          : undefined;
      if (textType || tokenType || imageType || floatingType) {
        const text = textType ? await (await item.getType(textType)).text() : undefined;
        const localToken = tokenType ? await (await item.getType(tokenType)).text() : undefined;
        const imageBlob = imageType ? await item.getType(imageType) : undefined;
        const floatingText = floatingType
          ? await (await item.getType(floatingType)).text()
          : undefined;
        return {
          text,
          localToken: localToken || undefined,
          ...(imageBlob
            ? {
                imageFile: new File([imageBlob], "pasted-image", {
                  type: imageBlob.type || imageType,
                }),
              }
            : {}),
          ...(floatingText
            ? { floatingImage: readFloatingImageClipboard({ getData: () => floatingText }) }
            : {}),
        };
      }
    }
  } catch {
    // Some browsers expose read() but only permit the text-only API.
  }

  return { text: await navigator.clipboard.readText() };
}

export function createBrowserGridClipboardPort(): GridClipboardPort {
  return {
    writeNativeRich: writeWithAsyncClipboard,
    async write(transfer) {
      const asyncClipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
      if (asyncClipboard && typeof ClipboardItem !== "undefined") {
        try {
          await writeWithAsyncClipboard(transfer);
          return { localTokenWritten: true };
        } catch {
          // Fall through to a text-only write when custom formats are rejected.
        }
      }

      // A floating image cannot be represented by text-only clipboard data.
      // Prefer the legacy rich event before considering the plain-text fallback.
      if (transfer.floatingImage && writeWithClipboardEvent(transfer)) {
        return { localTokenWritten: true };
      }
      if (asyncClipboard && !transfer.floatingImage) {
        try {
          await asyncClipboard.writeText(transfer.text);
          return { localTokenWritten: false };
        } catch {
          // Legacy copy remains useful in browsers without a permitted async API.
        }
      }

      if (writeWithClipboardEvent(transfer)) {
        return { localTokenWritten: true };
      }
      throw new Error("clipboard-unavailable");
    },
    async read(options) {
      if (options?.preferAsync) {
        return readWithAsyncClipboard();
      }
      const nativeTransfer = readWithClipboardEvent();
      if (!nativeTransfer) return readWithAsyncClipboard();
      if (nativeTransfer.localToken) return nativeTransfer;
      try {
        const asyncTransfer = await readWithAsyncClipboard();
        if (
          asyncTransfer.localToken &&
          areGridClipboardTextsEqual(nativeTransfer.text, asyncTransfer.text)
        ) {
          return { ...nativeTransfer, localToken: asyncTransfer.localToken };
        }
      } catch {
        // A successful native text read is still usable without async permission.
      }
      return nativeTransfer;
    },
  };
}
