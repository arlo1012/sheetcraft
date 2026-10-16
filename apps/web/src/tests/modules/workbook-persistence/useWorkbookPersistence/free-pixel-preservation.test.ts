import { describe, expect, test, vi } from "vitest";
import { getActiveSheet } from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { framedPicture } from "../../sheet-images/framed-picture-fixture";
import { asReceipt, createStore, createWorkbookWithValue, mountPersistence } from "./fixture";

describe("native free-pixel picture persistence", () => {
  test.each(["move-only", "move-and-size"] as const)(
    "%s recovers and saves V86 without normalizing raw marker offsets",
    async (mode) => {
      const original = createWorkbookWithValue("recoverable native markers");
      const picture = framedPicture();
      const start = { column: { index: 0, offset: 110.25 }, row: { index: 0, offset: 30.5 } };
      picture.frame.anchor =
        mode === "move-only"
          ? { mode, offsetMode: "free-pixels", origin: start, size: { width: 80, height: 40 } }
          : {
              mode,
              offsetMode: "free-pixels",
              start,
              end: { column: { index: 2, offset: 40 }, row: { index: 3, offset: 5 } },
            };
      getActiveSheet(original).floatingImages = [picture];
      const snapshot = serializeWorkbook(original);
      const save = vi.fn(async (_snapshot: ReturnType<typeof serializeWorkbook>) => asReceipt(2));
      const f = mountPersistence({
        store: createStore({
          load: async () => ({ revision: 1, savedAt: 1, snapshot }),
          save,
        }),
        workbook: createWorkbookWithValue("current"),
      });
      try {
        await f.persistence.ready;
        expect(f.persistence.error.value).toBeUndefined();
        expect(snapshot.version).toBe(86);
        expect(serializeWorkbook(f.getWorkbook())).toEqual(snapshot);
        expect(getActiveSheet(f.getWorkbook()).floatingImages[0]).toEqual(picture);
        f.edit("saved native markers");
        expect(await f.persistence.saveNow()).toBe(true);
        expect(save.mock.calls[0]?.[0]).toMatchObject({
          version: 86,
          sheets: [{ floatingImages: [picture] }],
        });
      } finally {
        f.wrapper.unmount();
      }
    },
  );
});
