import {
  projectLegacyPictureAxisOrigin,
  type PictureSheetMetrics,
} from "@sheetcraft/core/picture-axis-metrics";
import { anchorPictureFrameRect, resolvePictureFrame } from "@sheetcraft/core/picture-frame";
import { isPictureGroup, type PictureGroupPath } from "@sheetcraft/core/picture-group";
import { resolvePictureGroup } from "@sheetcraft/core/picture-group-layout";
import { isFramedPictureObject, type PictureObject } from "@sheetcraft/core/picture-object";
import type { CellAddress, Sheet } from "@sheetcraft/core/workbook";
import type { PictureFrameLayoutContext } from "@sheetcraft/sheet-engine/picture-frame-layout";
import type { MessageKey } from "../../shared/i18n";
import { createBrowserIdFactory } from "../../shared/runtime/browser-id-factory";
import {
  areGridClipboardTextsEqual,
  SHEETCRAFT_CLIPBOARD_TYPE,
  type GridClipboardPort,
  type GridClipboardTransfer,
} from "../sheet-grid/gridClipboardPort";
import {
  createOwnedPictureClipboardSession,
  OwnedPictureClipboardError,
  type OwnedPictureClipboardIdentity,
  type OwnedPictureClipboardPlacement,
  type OwnedPictureClipboardPlan,
  type OwnedPictureClipboardSnapshot,
} from "./owned-picture-clipboard";

type Owner = {
  sheet: Sheet;
  sheetId: string;
  revision: number;
  generation: number;
  context: PictureFrameLayoutContext;
};
type NativeTransfer = { text: string; localToken: string };

function sameIdentity(
  left: OwnedPictureClipboardIdentity | undefined,
  right: OwnedPictureClipboardIdentity | undefined,
): boolean {
  return Boolean(
    left && right && left.token === right.token && left.generation === right.generation,
  );
}

/** Legacy width/height describe the old display box even after a quarter turn. */
function rootRect(root: PictureObject, metrics: PictureSheetMetrics) {
  if (!isPictureGroup(root) && !isFramedPictureObject(root))
    return {
      x: projectLegacyPictureAxisOrigin(root.anchor.column, root.offsetX, metrics.columns),
      y: projectLegacyPictureAxisOrigin(root.anchor.row, root.offsetY, metrics.rows),
      width: root.width,
      height: root.height,
    };
  const layout = isPictureGroup(root)
    ? resolvePictureGroup(root, metrics).layout
    : resolvePictureFrame(root.frame, metrics);
  if (layout.collapsed) throw new OwnedPictureClipboardError("collapsed-selection");
  return layout.rect;
}

function placeRoots(
  placement: OwnedPictureClipboardPlacement,
  address: CellAddress,
  context: PictureFrameLayoutContext,
): readonly PictureObject[] {
  const destination = context.layout.getCellRect(address);
  if (!destination) throw new OwnedPictureClipboardError("invalid-placement");
  const rectangles = placement.roots.map((root) => rootRect(root, placement.sourceMetrics));
  const left = Math.min(...rectangles.map((rect) => rect.x));
  const top = Math.min(...rectangles.map((rect) => rect.y));
  const dx = destination.x - left;
  const dy = destination.y - top;
  return placement.roots.map((root, index) => {
    const original = rectangles[index]!;
    const rect = { ...original, x: original.x + dx, y: original.y + dy };
    if (!isPictureGroup(root) && !isFramedPictureObject(root)) {
      // All roots share the destination cell. Offsets remain free legacy pixels,
      // including coordinates beyond the terminal sheet boundary.
      const offsetX = rect.x - destination.x;
      const offsetY = rect.y - destination.y;
      if (offsetX < 0 || offsetY < 0) throw new OwnedPictureClipboardError("invalid-placement");
      return { ...root, anchor: { ...address }, offsetX, offsetY };
    }
    const anchor = anchorPictureFrameRect(
      root.frame.anchor.mode,
      rect,
      placement.destinationMetrics,
    );
    return { ...root, frame: { ...root.frame, anchor } } as PictureObject;
  });
}

/** Bounded, document-local tree clipboard. Native transfer contains only text and a local lease. */
export function useOwnedPictureClipboard(options: {
  getSheet: () => Sheet;
  getRevision: () => number;
  getOwnerGeneration: () => number;
  getFrameContext: () => PictureFrameLayoutContext | undefined;
  getSelectedPaths?: () => readonly PictureGroupPath[] | undefined;
  clipboardPort: GridClipboardPort;
  execute: (nextForest: readonly PictureObject[]) => boolean;
  onCopy: () => void;
  onFeedback: (key: MessageKey) => void;
}) {
  const createId = createBrowserIdFactory();
  const session = createOwnedPictureClipboardSession({
    createId: () => createId("picture"),
    createToken: () => createId("owned-picture-clipboard"),
  });
  let operation = 0;
  let nativeWrites = Promise.resolve();
  let cutOwner: Owner | undefined;
  let nativeTransfer: NativeTransfer | undefined;

  function owner(): Owner | undefined {
    const context = options.getFrameContext();
    const sheet = options.getSheet();
    return context
      ? {
          sheet,
          sheetId: sheet.id,
          revision: options.getRevision(),
          generation: options.getOwnerGeneration(),
          context,
        }
      : undefined;
  }
  function sameOwner(expected: Owner, current: Owner | undefined, requireLayout = true): boolean {
    return Boolean(
      current &&
      current.sheet === expected.sheet &&
      current.sheetId === expected.sheetId &&
      current.revision === expected.revision &&
      current.generation === expected.generation &&
      current.context.metrics === expected.context.metrics &&
      (!requireLayout || current.context.layout === expected.context.layout),
    );
  }
  function clear(identity?: OwnedPictureClipboardIdentity): boolean {
    if (arguments.length === 0) identity = session.getCurrent();
    if (!identity || !session.clear(identity)) return false;
    operation += 1;
    cutOwner = undefined;
    nativeTransfer = undefined;
    return true;
  }
  function current(): OwnedPictureClipboardSnapshot | undefined {
    const captured = session.getCurrent();
    // A cut owns sheet-space metrics, not a scroll/frozen-pane projection.
    if (captured?.mode === "cut" && (!cutOwner || !sameOwner(cutOwner, owner(), false))) {
      clear(captured);
      return undefined;
    }
    return captured;
  }
  function observeTransfer(
    transfer: GridClipboardTransfer,
    identity?: OwnedPictureClipboardIdentity,
  ): void {
    if (arguments.length === 1) identity = session.getCurrent();
    if (!sameIdentity(identity, session.getCurrent())) return;
    // An explicitly unsupported rich payload is refused without consuming a prior local cut.
    if (transfer.invalidFloatingImage && transfer.unsupportedFloatingImage) return;
    if (
      !nativeTransfer ||
      transfer.localToken !== nativeTransfer.localToken ||
      (transfer.text !== undefined &&
        !areGridClipboardTextsEqual(transfer.text, nativeTransfer.text)) ||
      transfer.imageFile ||
      transfer.floatingImage ||
      transfer.floatingImages ||
      transfer.invalidFloatingImage ||
      transfer.unsupportedFloatingImage
    )
      clear(identity);
  }
  function queueWrite(
    transfer: NativeTransfer,
    identity: OwnedPictureClipboardIdentity,
    startedOperation: number,
    nativeEvent: boolean,
  ): Promise<void> {
    nativeWrites = nativeWrites.then(async () => {
      if (operation !== startedOperation || !sameIdentity(identity, session.getCurrent())) return;
      try {
        if (nativeEvent && options.clipboardPort.writeNativeRich)
          await options.clipboardPort.writeNativeRich(transfer);
        else await options.clipboardPort.write(transfer);
      } catch {
        // Local explicit paste remains available. Unknown native contents never
        // gain ownership merely because their text happens to match alt text.
      }
    });
    return nativeWrites;
  }
  async function copy(
    paths: readonly PictureGroupPath[] | undefined,
    mode: "copy" | "cut",
    event?: ClipboardEvent,
  ): Promise<void> {
    event?.preventDefault();
    event?.stopPropagation();
    const capturedOwner = owner();
    if (!capturedOwner) {
      options.onFeedback("image.copyFailed");
      return;
    }
    let captured: OwnedPictureClipboardSnapshot;
    try {
      captured = session.capture({
        sheet: capturedOwner.sheet,
        revision: capturedOwner.revision,
        ownerGeneration: capturedOwner.generation,
        sourceMetrics: capturedOwner.context.metrics,
        mode,
        selectedPaths: paths ?? options.getSelectedPaths?.() ?? [],
      });
    } catch {
      options.onFeedback("image.copyFailed");
      return;
    }
    if (!sameOwner(capturedOwner, owner())) {
      clear(captured);
      options.onFeedback("image.copyFailed");
      return;
    }
    const startedOperation = ++operation;
    cutOwner = mode === "cut" ? capturedOwner : undefined;
    const transfer = {
      text: captured.roots.map((root) => root.altText).join("\n"),
      localToken: captured.token,
    };
    nativeTransfer = transfer;
    options.onCopy();
    if (operation !== startedOperation || !sameIdentity(captured, session.getCurrent())) return;
    options.onFeedback(mode === "cut" ? "clipboard.readyToMove" : "image.copied");
    if (operation !== startedOperation || !sameIdentity(captured, session.getCurrent())) return;
    if (event?.clipboardData) {
      try {
        event.clipboardData.setData("text/plain", transfer.text);
        event.clipboardData.setData(SHEETCRAFT_CLIPBOARD_TYPE, transfer.localToken);
      } catch {
        // A denied custom format does not discard the owned local snapshot.
      }
    }
    await queueWrite(transfer, captured, startedOperation, Boolean(event?.clipboardData));
  }
  function paste(address: CellAddress, transfer?: GridClipboardTransfer): boolean {
    const captured = current();
    if (!captured) return false;
    if (transfer?.invalidFloatingImage && transfer.unsupportedFloatingImage) {
      options.onFeedback("clipboard.pasteRejected");
      return true;
    }
    if (transfer !== undefined) {
      observeTransfer(transfer, captured);
      if (!sameIdentity(captured, session.getCurrent())) return false;
    }
    const destination = owner();
    if (!destination) {
      options.onFeedback("clipboard.pasteRejected");
      return true;
    }
    let plan: OwnedPictureClipboardPlan;
    try {
      plan = session.planPaste({
        token: captured.token,
        generation: captured.generation,
        sheet: destination.sheet,
        revision: destination.revision,
        ownerGeneration: destination.generation,
        sourceMetrics: captured.sourceMetrics,
        destinationMetrics: destination.context.metrics,
        placeRoots: (placement) => placeRoots(placement, address, destination.context),
      });
      if (!sameIdentity(captured, session.getCurrent()) || !sameOwner(destination, owner()))
        throw new OwnedPictureClipboardError("stale-owner");
    } catch (error) {
      if (sameIdentity(captured, session.getCurrent()))
        options.onFeedback(
          error instanceof OwnedPictureClipboardError && error.reason === "stale-owner"
            ? "clipboard.documentChanged"
            : "clipboard.pasteRejected",
        );
      return true;
    }
    let accepted = false;
    try {
      accepted = options.execute(plan.nextForest) === true;
    } catch {
      // A thrown/rejected command never consumes the cut lease.
    }
    if (session.complete(plan, accepted)) {
      operation += 1;
      cutOwner = undefined;
      nativeTransfer = undefined;
    } else if (!accepted && sameIdentity(captured, session.getCurrent()))
      options.onFeedback("clipboard.pasteRejected");
    return true;
  }
  function clearCut(identity?: OwnedPictureClipboardIdentity): boolean {
    if (arguments.length === 0) identity = session.getCurrent();
    return session.getCurrent()?.mode === "cut" ? clear(identity) : false;
  }
  return {
    copy,
    paste,
    hasPending: () => Boolean(current()),
    observeTransfer,
    clear,
    clearCut,
    getIdentity: (): OwnedPictureClipboardIdentity | undefined => {
      const captured = current();
      return captured ? { token: captured.token, generation: captured.generation } : undefined;
    },
    getOperation: () => operation,
  };
}
