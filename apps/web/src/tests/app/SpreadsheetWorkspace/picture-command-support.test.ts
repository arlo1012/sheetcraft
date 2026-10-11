import { defineComponent, h, ref } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import {
  createSetFloatingImageCommand,
  createSetSheetFloatingImagesCommand,
} from "@sheetcraft/core/commands";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { framedPicture } from "../../modules/sheet-images/framed-picture-fixture";
import { pictureGroup } from "../../modules/sheet-images/picture-group-fixture";
import { useSpreadsheetWorkspaceController } from "../../../app/composables/useSpreadsheetWorkspaceController";
import { createAppI18n } from "../../../shared/i18n";

let wrapper: ReturnType<typeof mount> | undefined;
function fixture() {
  let controller!: ReturnType<typeof useSpreadsheetWorkspaceController>;
  wrapper = mount(
    defineComponent({
      setup() {
        controller = useSpreadsheetWorkspaceController({ idFactory: createSequentialIdFactory() });
        return () => h("div");
      },
    }),
    { global: { plugins: [createAppI18n("en-US")] } },
  );
  const draft = ref("uncommitted draft");
  const flushPendingEdit = vi.fn(() => {
      draft.value = "";
      return true;
    }),
    clearClipboard = vi.fn();
  controller.setGridNavigator({
    flushPendingEdit,
    clearClipboard,
    hasPendingEdit: () => Boolean(draft.value),
    navigateToCell() {},
    focusGrid() {},
  } as never);
  controller.commitCell({ address: { row: 0, column: 0 }, input: "retained" });
  controller.commitCell({ address: { row: 0, column: 1 }, input: "redo entry" });
  controller.undo();
  return { controller, draft, flushPendingEdit, clearClipboard };
}
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
});

describe("owned picture controller atomic outcomes", () => {
  test("supported group ingress, undo, and redo preserve snapshot48 ownership", () => {
    const { controller } = fixture();
    expect(
      controller.executeCommand(
        createSetSheetFloatingImagesCommand(controller.activeSheet.value.id, [pictureGroup()]),
      ),
    ).toBe(true);
    const grouped = serializeWorkbook(controller.session.workbook);
    expect(grouped.version).toBe(48);
    expect(controller.undo()).toBe(true);
    expect(controller.activeSheet.value.floatingImages).toEqual([]);
    expect(controller.redo()).toBe(true);
    expect(serializeWorkbook(controller.session.workbook)).toEqual(grouped);
  });

  test.each(["standalone", "owned-hidden-leaf"] as const)(
    "%s explicit reflection returns a visible rejection before history and draft changes",
    (kind) => {
      const f = fixture(),
        { controller } = f;
      const group = pictureGroup();
      group.hidden = true;
      const leaf = group.members[0]!;
      if (leaf.kind !== "grouped-picture-v1") throw new Error("Expected fixture leaf.");
      leaf.hidden = true;
      leaf.transform = { appearance: { reflection: true } };
      const image =
        kind === "standalone"
          ? { ...framedPicture(), transform: { appearance: { reflection: true } } }
          : group;
      const command = createSetFloatingImageCommand(controller.activeSheet.value.id, image);
      const before = serializeWorkbook(controller.session.workbook);
      const history = JSON.parse(JSON.stringify(controller.session.history));
      const revision = controller.workbookRevision.value,
        generation = controller.workbookGeneration.value;
      f.flushPendingEdit.mockClear();
      expect(controller.executeCommand(command)).toBe(false);
      expect(controller.executeReplaceableCommand(command)).toEqual({
        changed: false,
        accepted: false,
      });
      expect(controller.setFloatingImage(image)).toBe(false);
      expect(controller.workspaceStatusText.value).toBe(
        controller.t("picture.groupReflectionUnsupported"),
      );
      expect(serializeWorkbook(controller.session.workbook)).toEqual(before);
      expect(controller.session.history).toEqual(history);
      expect(controller.workbookRevision.value).toBe(revision);
      expect(controller.workbookGeneration.value).toBe(generation);
      expect(f.draft.value).toBe("uncommitted draft");
      expect(f.flushPendingEdit).not.toHaveBeenCalled();
      expect(f.clearClipboard).not.toHaveBeenCalled();
      expect(controller.hasPendingGridEdit()).toBe(true);
    },
  );

  test("unrelated malformed geometry remains an error and preserves the document", () => {
    const { controller } = fixture(),
      image = framedPicture();
    image.frame.angleDeg = Number.NaN;
    const before = serializeWorkbook(controller.session.workbook);
    const command = {
      type: "setFloatingImage" as const,
      sheetId: controller.activeSheet.value.id,
      image,
    };
    expect(() => controller.executeCommand(command)).toThrow(RangeError);
    expect(() => controller.executeReplaceableCommand(command)).toThrow(RangeError);
    expect(serializeWorkbook(controller.session.workbook)).toEqual(before);
    expect(controller.workspaceStatusText.value).toBe("");
  });
});
