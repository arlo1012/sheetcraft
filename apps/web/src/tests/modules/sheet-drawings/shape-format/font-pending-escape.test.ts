import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { computed, defineComponent, h, ref } from "vue";
import { afterEach, expect, test, vi } from "vitest";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { createWorkbookSession, executeWorkbookCommand } from "@sheetcraft/core/history";
import { createSetSheetDrawingsCommand } from "@sheetcraft/core/commands";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import type { SheetDrawing } from "@sheetcraft/core/sheet-drawings";
import { createDefaultShapeText } from "../../../../modules/sheet-drawings/shape-text-options";
import { createGraphicDrawing } from "../../../../modules/sheet-drawings/drawing-defaults";
import { useOwnedShapeFormatPane } from "../../../../modules/sheet-drawings/useOwnedShapeFormatPane";
import { useShapeFormatPane } from "../../../../modules/sheet-drawings/components/shape-format/useShapeFormatPane";
import ShapeFontFamilyField from "../../../../modules/sheet-drawings/components/ShapeFontFamilyField.vue";
import { createAppI18n } from "../../../../shared/i18n";

const fonts = vi.hoisted(() => ({ load: vi.fn<(family: string) => Promise<void>>() }));
vi.mock("../../../../shared/cell-text/font-resources", async (original) => ({
  ...(await original<object>()),
  ensureCellFontResource: fonts.load,
  cellFontResourceNeedsLoading: (family: string) => family === "Noto Sans",
  getCellFontResourceFamilies: (family: string) => [family],
}));
vi.mock("../../../../shared/cell-text/useFontCatalog", () => ({
  useFontCatalog: () => ({
    fontOptions: computed(() => [
      { value: "Noto Sans", label: "Noto Sans" },
      { value: "Arial", label: "Arial" },
    ]),
  }),
}));
const wrappers: VueWrapper[] = [];
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.replaceChildren();
});

function fixture() {
  const workbook = ref(createWorkbook({ id: "book", sheetId: "sheet" }));
  const sheet = getActiveSheet(workbook.value);
  const drawing = createGraphicDrawing("shape", "shape", "shape", { row: 0, column: 0 });
  drawing.shapeText = { ...createDefaultShapeText(), fontFamily: "Arial" };
  // Isolate cancellation/owner/history from unrelated platform text rasterization.
  drawing.text = "";
  sheet.drawings = [drawing];
  const session = createWorkbookSession({
    workbook: workbook.value,
    idFactory: createSequentialIdFactory(),
  });
  const revision = ref(0);
  const update = vi.fn((next: SheetDrawing, owner: SheetDrawing) => {
    if (sheet.drawings?.find((item) => item.id === owner.id) !== owner) return false;
    const changed = executeWorkbookCommand(
      session,
      createSetSheetDrawingsCommand(sheet.id, [next]),
    );
    if (changed) revision.value++;
    return changed;
  });
  const wrapper = mount(
    defineComponent({
      setup() {
        const pane = useOwnedShapeFormatPane({
          getWorkbook: () => workbook.value,
          getSheet: () => sheet,
          getGeneration: () => 0,
          getRevision: () => revision.value,
          isBusy: () => false,
          flush: () => true,
          update,
          isAssetAvailable: () => true,
          getUnsupportedReason: () => "Unsupported",
        });
        expect(pane.open(sheet.drawings![0]!)).toBe(true);
        const controller = useShapeFormatPane({
          get snapshot() {
            return pane.snapshot.value;
          },
          get capabilities() {
            return pane.capabilities.value;
          },
          onIntent: pane.onIntent,
          locale: "en-US",
          t: (key) => key,
        });
        return () => h(ShapeFontFamilyField, { controller });
      },
    }),
    {
      attachTo: document.body,
      global: { plugins: [createAppI18n("en-US")], stubs: { FontSettingsAction: true } },
    },
  );
  wrappers.push(wrapper);
  return { wrapper, session, workbook, update };
}

test.each(["arrow", "input", "menu", "composing", "none"] as const)(
  "real font menu pending history respects Escape target=%s",
  async (target) => {
    const cancel = target === "arrow" || target === "input";
    fonts.load.mockReset();
    let complete!: () => void;
    fonts.load.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    );
    const f = fixture();
    const before = serializeWorkbook(f.workbook.value);
    expect(f.wrapper.get<HTMLInputElement>("input").element.value).toBe("Arial");
    const arrow = f.wrapper.get<HTMLElement>(".font-format-field__arrow");
    await arrow.trigger("click");
    await flushPromises();
    const option = [...document.body.querySelectorAll<HTMLElement>('[role="menuitemradio"]')].find(
      (item) => item.textContent?.trim() === "Noto Sans",
    );
    expect(option).toBeDefined();
    option!.click();
    await flushPromises();
    expect(fonts.load).toHaveBeenCalledTimes(1);
    expect(fonts.load.mock.calls[0]?.[0]).toBe("Noto Sans");
    expect(f.update).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(arrow.element);
    expect(f.wrapper.text()).toContain("Loading font");
    if (target === "input") f.wrapper.get<HTMLInputElement>("input").element.focus();
    if (target === "menu") {
      await arrow.trigger("click");
      await flushPromises();
      const pendingOption = [
        ...document.body.querySelectorAll<HTMLElement>('[role="menuitemradio"]'),
      ].find((item) => item.textContent?.trim() === "Noto Sans");
      expect(pendingOption).toBeDefined();
      pendingOption!.focus();
    }
    if (target !== "none")
      document.activeElement!.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          code: "Escape",
          bubbles: true,
          cancelable: true,
          isComposing: target === "composing",
        }),
      );
    await flushPromises();
    if (target === "menu") expect(arrow.attributes("aria-expanded")).toBe("false");
    complete();
    await flushPromises();
    expect(f.update).toHaveBeenCalledTimes(cancel ? 0 : 1);
    expect(f.session.history.undoStack).toHaveLength(cancel ? 0 : 1);
    if (cancel) expect(serializeWorkbook(f.workbook.value)).toEqual(before);
    else expect(serializeWorkbook(f.workbook.value)).not.toEqual(before);
    expect(f.wrapper.get<HTMLInputElement>("input").element.value).toBe(
      cancel ? "Arial" : "Noto Sans",
    );
    expect(f.wrapper.text()).not.toContain("Loading font");
  },
);
