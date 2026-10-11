import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  deserializeSheet,
  serializeSheet,
  serializeWorkbook,
} from "@sheetcraft/core/serialization";
import { createWorkbook } from "@sheetcraft/core/workbook";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { prepareImageAsset } from "../../../../modules/image-assets/prepareImageAsset";
import { asset, contextFor, deferred, file, fixture } from "./replacement-fixture";

vi.mock("../../../../modules/image-assets/prepareImageAsset", () => ({
  prepareImageAsset: vi.fn(),
}));
beforeEach(() => {
  vi.mocked(prepareImageAsset).mockReset().mockResolvedValue(asset);
});

describe("source replacement operation owners", () => {
  test.each(["framed", "owned"] as const)(
    "%s validates ownership at both decoding and storage boundaries",
    async (kind) => {
      for (const boundary of ["decode", "store"] as const) {
        for (const change of [
          "same-id-sheet",
          "workbook",
          "generation",
          "cancel",
          "dispose",
          "permission",
          "selection",
          "asset",
          "crop",
          "reorder",
          "missing-context",
          "new-metrics",
          "mutated-metrics",
          "deleted",
        ] as const) {
          const f = fixture();
          if (kind === "owned") f.selectOwned();
          const waiting = deferred<typeof asset>();
          const writing = deferred<void>();
          const entered = deferred<void>();
          if (boundary === "decode") vi.mocked(prepareImageAsset).mockReturnValue(waiting.promise);
          else {
            vi.mocked(prepareImageAsset).mockResolvedValue(asset);
            f.put.mockImplementation(async () => {
              entered.resolve();
              await writing.promise;
            });
          }
          const rootId = kind === "owned" ? f.leafPath[0]! : "framed";
          const pending = f.actions.insertFile(file, "floating", undefined, rootId);
          if (boundary === "store") await entered.promise;
          const node = kind === "owned" ? f.currentLeaf() : f.currentFramed();
          if (change === "same-id-sheet") f.replaceSheet(deserializeSheet(serializeSheet(f.sheet)));
          if (change === "workbook")
            f.session.workbook = createWorkbook({ idFactory: createSequentialIdFactory() });
          if (change === "generation") f.changeGeneration();
          if (change === "cancel") f.actions.cancelPending();
          if (change === "dispose") f.scope.stop();
          if (change === "permission") f.sheet.properties.protected = true;
          if (change === "selection") f.select("legacy");
          if (change === "asset") node.assetId = "newer-user-source";
          if (change === "crop") node.frame.source.offsetXRatio = 0.25;
          if (change === "reorder") f.sheet.floatingImages.reverse();
          if (change === "missing-context") f.setContext(undefined);
          if (change === "new-metrics") f.setContext(contextFor(f.sheet));
          if (change === "mutated-metrics") f.getContext()!.metrics.rows.visibleSize = () => 19;
          if (change === "deleted")
            f.sheet.floatingImages = f.sheet.floatingImages.filter((image) => image.id !== rootId);
          const before = serializeWorkbook(f.session.workbook);
          if (boundary === "decode") waiting.resolve(asset);
          else writing.resolve();
          await pending;
          expect(f.execute, `${kind}/${boundary}/${change}`).not.toHaveBeenCalled();
          expect(serializeWorkbook(f.session.workbook), `${kind}/${boundary}/${change}`).toEqual(
            before,
          );
          expect(f.session.history.undoStack, `${kind}/${boundary}/${change}`).toHaveLength(0);
          if (boundary === "decode")
            expect(f.put, `${kind}/${boundary}/${change}`).not.toHaveBeenCalled();
          expect(f.actions.busy.value).toBe(false);
          f.scope.stop();
        }
      }
    },
  );
  test.each([
    "sibling-order",
    "reparent",
    "target-kind",
    "hidden-owner",
    "collapsed-owner",
  ] as const)("owned %s changes refuse without replacing another source", async (change) => {
    const f = fixture();
    f.selectOwned();
    const waiting = deferred<typeof asset>();
    vi.mocked(prepareImageAsset).mockReturnValue(waiting.promise);
    const pending = f.actions.insertFile(file, "floating", undefined, f.leafPath[0]);
    const group = f.currentGroup();
    if (change === "sibling-order") group.members.reverse();
    if (change === "reparent") {
      const target = group.members.shift()!;
      group.members.push({
        kind: "grouped-group-v1",
        id: "new-owner",
        altText: "New owner",
        frame: {
          kind: "group-local-frame-v1",
          angleDeg: 0,
          rect: { xRatio: 0, yRatio: 0, widthRatio: 1, heightRatio: 1 },
        },
        members: [target],
      });
    }
    if (change === "target-kind") {
      const target = f.currentLeaf();
      group.members[0] = {
        kind: "grouped-group-v1",
        id: target.id,
        altText: target.altText,
        frame: { kind: "group-local-frame-v1", angleDeg: 0, rect: { ...target.frame.rect } },
        members: [{ ...target, id: "descendant-source" }],
      };
    }
    if (change === "hidden-owner") group.hidden = true;
    if (change === "collapsed-owner") {
      group.frame.anchor = {
        mode: "move-and-size",
        start: { column: { index: 0, offset: 0 }, row: { index: 0, offset: 0 } },
        end: { column: { index: 1, offset: 0 }, row: { index: 2, offset: 0 } },
      };
      (f.sheet.hiddenColumns ??= new Set()).add(0);
      f.setContext(contextFor(f.sheet));
    }
    const before = serializeWorkbook(f.session.workbook);
    waiting.resolve(asset);
    await pending;
    expect(f.put).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    f.scope.stop();
  });
  test("latest sibling and unrelated source metadata survive replacement of one owned leaf", async () => {
    const f = fixture();
    f.selectOwned();
    const waiting = deferred<typeof asset>();
    vi.mocked(prepareImageAsset).mockReturnValue(waiting.promise);
    const pending = f.actions.insertFile(file, "floating", undefined, f.leafPath[0]);
    const sibling = f.currentLeaf([f.leafPath[0]!, "sibling"]);
    sibling.assetId = "sibling-new-source";
    sibling.altText = "Sibling new description";
    sibling.frame.source.offsetYRatio = 0.4;
    f.currentFramed().assetId = "unrelated-new-source";
    waiting.resolve(asset);
    await pending;
    expect(f.currentLeaf().assetId).toBe(asset.id);
    expect(f.currentLeaf([f.leafPath[0]!, "sibling"])).toEqual(sibling);
    expect(f.currentFramed().assetId).toBe("unrelated-new-source");
    expect(f.session.history.undoStack).toHaveLength(1);
    f.scope.stop();
  });
  test.each(["decode", "store", "command"] as const)(
    "%s failure preserves the complete forest and reports failure",
    async (boundary) => {
      const f = fixture();
      f.selectOwned();
      if (boundary === "decode")
        vi.mocked(prepareImageAsset).mockRejectedValue(new Error("Decode refused"));
      if (boundary === "store") f.put.mockRejectedValue(new Error("Storage refused"));
      if (boundary === "command") f.refuse();
      const before = serializeWorkbook(f.session.workbook);
      await f.actions.insertFile(file, "floating", undefined, f.leafPath[0]);
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
      expect(f.session.history.undoStack).toHaveLength(0);
      expect(f.actions.feedback.value).toBe("image.insertionFailed");
      expect(f.actions.busy.value).toBe(false);
      f.scope.stop();
    },
  );
  test("a revoked old decode cannot overwrite new feedback", async () => {
    const f = fixture();
    const waiting = deferred<typeof asset>();
    vi.mocked(prepareImageAsset).mockReturnValue(waiting.promise);
    const pending = f.actions.insertFile(file, "floating", undefined, "framed");
    f.actions.cancelPending();
    f.actions.reportFeedback("picture.noSmaller");
    waiting.reject(new Error("Late failure"));
    await pending;
    expect(f.actions.feedback.value).toBe("picture.noSmaller");
    f.scope.stop();
  });
});
