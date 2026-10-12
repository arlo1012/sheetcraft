import { beforeEach, expect, test, vi } from "vitest";
import { isPictureGroup } from "@sheetcraft/core/picture-group";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { prepareImageAsset } from "../../../../modules/image-assets/prepareImageAsset";
import { asset, deferred, file, fixture } from "./replacement-fixture";
vi.mock("../../../../modules/image-assets/prepareImageAsset", () => ({
  prepareImageAsset: vi.fn(),
}));
beforeEach(() => vi.mocked(prepareImageAsset).mockReset().mockResolvedValue(asset));

test.each(["legacy", "framed", "owned"] as const)(
  "unlocked protected %s replacement retains an exact target without enabling insertion",
  async (kind) => {
    const f = fixture();
    const rootId = kind === "owned" ? f.leafPath[0]! : kind;
    f.sheet.floatingImages.find((root) => root.id === rootId)!.locked = false;
    f.sheet.properties.protected = true;
    f.sheet.protection = { editableRanges: [] };
    f.select(rootId, kind === "owned" ? f.leafPath : null);
    expect(f.actions.canReplace(rootId)).toBe(true);
    await f.actions.insertFile(file, "floating", undefined, rootId);
    expect(f.execute).toHaveBeenCalledOnce();
    const root = f.sheet.floatingImages.find((root) => root.id === rootId)!;
    expect(kind === "owned" ? f.currentLeaf().assetId : !isPictureGroup(root) && root.assetId).toBe(
      asset.id,
    );
    const before = serializeWorkbook(f.session.workbook);
    const history = f.session.history.undoStack.length;
    await f.actions.insertFile(file);
    expect(f.execute).toHaveBeenCalledOnce();
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(history);
    f.scope.stop();
  },
);
test.each(["decode", "storage"] as const)(
  "replacement rechecks effective root lock after %s without history or source loss",
  async (boundary) => {
    const f = fixture();
    f.selectOwned();
    f.currentGroup().locked = false;
    f.sheet.properties.protected = true;
    f.sheet.protection = { editableRanges: [] };
    const waiting = deferred<typeof asset>(),
      writing = deferred<void>(),
      entered = deferred<void>();
    if (boundary === "decode") vi.mocked(prepareImageAsset).mockReturnValue(waiting.promise);
    else
      f.put.mockImplementation(async () => {
        entered.resolve();
        await writing.promise;
      });
    const pending = f.actions.insertFile(file, "floating", undefined, f.leafPath[0]!);
    if (boundary === "storage") await entered.promise;
    delete f.currentGroup().locked;
    f.currentLeaf().locked = false;
    const before = serializeWorkbook(f.session.workbook);
    if (boundary === "decode") waiting.resolve(asset);
    else writing.resolve();
    await pending;
    expect(f.execute).not.toHaveBeenCalled();
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(0);
    if (boundary === "decode") expect(f.put).not.toHaveBeenCalled();
    f.scope.stop();
  },
);
