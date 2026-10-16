import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { defineComponent, h, reactive, nextTick } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import ShapeRibbonFontSizeField from "../../../modules/sheet-drawings/components/ShapeRibbonFontSizeField.vue";
import FontFormatField from "../../../shared/cell-text/FontFormatField.vue";
import {
  useShapeFormatPane,
  type ShapeFormatPaneInput,
  type ShapeFormatController,
} from "../../../modules/sheet-drawings/components/shape-format/useShapeFormatPane";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import { drawingShapeTextValues } from "../../../modules/sheet-drawings/shape-text-options";
import type {
  ShapeFormatIntent,
  ShapeFormatSnapshot,
} from "../../../modules/sheet-drawings/shape-format-pane-model";
import {
  createShapeTextFieldDrafts,
  shapeTextFieldDraftsKey,
} from "../../../modules/sheet-drawings/shape-text-field-drafts";
const mounted: VueWrapper[] = [];
afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount());
  document.body.replaceChildren();
});
function fixture() {
  const drawing = createGraphicDrawing("shape", "textBox", "text", { row: 0, column: 0 });
  const snapshot: ShapeFormatSnapshot = {
    owner: { workbookId: "book", sheetId: "sheet", drawingId: "shape", sessionId: "session-a" },
    revision: 1,
    drawing,
    values: { ...drawingShapeTextValues(drawing), fontSizePt: 11 },
  };
  const rejected = { value: false };
  const onIntent = vi.fn((intent: ShapeFormatIntent) => {
    if (rejected.value) return false;
    if (intent.type === "set-field")
      source.snapshot = {
        ...source.snapshot!,
        revision: source.snapshot!.revision + 1,
        acceptedIntentId: intent.intentId,
        values: { ...source.snapshot!.values, [intent.field]: intent.value },
      };
    return true;
  });
  const source = reactive<ShapeFormatPaneInput>({
    snapshot,
    capabilities: { fields: { fontSizePt: { enabled: true, min: 1, max: 1000 } } },
    onIntent,
    t: (key) => key,
    locale: "en-US",
  });
  const registry = createShapeTextFieldDrafts();
  let controller!: ShapeFormatController;
  const wrapper = mount(
    defineComponent({
      setup() {
        controller = useShapeFormatPane(source);
        return () => h(ShapeRibbonFontSizeField, { controller, sessionId: 7 });
      },
    }),
    { attachTo: document.body, global: { provide: { [shapeTextFieldDraftsKey]: registry } } },
  );
  mounted.push(wrapper);
  return {
    wrapper,
    input: wrapper.get<HTMLInputElement>("input"),
    source,
    onIntent,
    rejected,
    registry,
    controller: () => controller,
  };
}
async function key(f: ReturnType<typeof fixture>, name: string) {
  await f.input.trigger("keydown", { key: name, code: name });
  await flushPromises();
}
async function choose(f: ReturnType<typeof fixture>, value: string) {
  await f.wrapper.get(".font-format-field__arrow").trigger("click");
  await flushPromises();
  const row = [...document.body.querySelectorAll<HTMLElement>('[role="menuitemradio"]')].find(
    (e) => e.textContent?.trim() === value,
  )!;
  expect(row).toBeDefined();
  row.click();
  await flushPromises();
}
describe("shape font combo on the existing pt/lease/session contract", () => {
  test("actual Text Tools size is the shared combo and observed choices include custom current size", async () => {
    const f = fixture();
    expect(f.wrapper.findComponent(FontFormatField).exists()).toBe(true);
    expect(f.wrapper.find(".t-input-number").exists()).toBe(false);
    expect(f.input.attributes()).toMatchObject({
      role: "combobox",
      "aria-description": "pt",
      "data-shape-text-edit-session": "7",
      "data-shape-format-field": "fontSizePt",
    });
    await choose(f, "14");
    expect(f.onIntent).toHaveBeenCalledTimes(1);
    expect(f.onIntent.mock.calls[0]?.[0]).toMatchObject({
      type: "set-field",
      field: "fontSizePt",
      value: 14,
      owner: f.source.snapshot!.owner,
      baseRevision: 1,
    });
  });
  test("decimal pt remains decimal, Enter plus blur is one intent, own ack allows a second edit", async () => {
    const f = fixture();
    f.input.element.focus();
    await f.input.setValue("15.5");
    await key(f, "Enter");
    f.input.element.blur();
    await flushPromises();
    expect(f.onIntent).toHaveBeenCalledTimes(1);
    expect(f.source.snapshot!.values.fontSizePt).toBe(15.5);
    await f.input.setValue("19.5");
    await key(f, "Enter");
    expect(f.onIntent).toHaveBeenCalledTimes(2);
    expect(f.source.snapshot!.values.fontSizePt).toBe(19.5);
  });
  test("invalid size blocks the registered exact text session until explicit Escape", async () => {
    const f = fixture();
    await f.input.setValue("oops");
    expect(f.registry.flush("session-a")).toEqual({ accepted: false });
    await flushPromises();
    expect(f.onIntent).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(f.input.element);
    expect(document.getElementById(f.input.attributes("aria-describedby")!)).not.toBeNull();
    await key(f, "Escape");
    expect(f.registry.flush("session-a")).toEqual({ accepted: true });
    expect(f.source.snapshot!.values.fontSizePt).toBe(11);
  });
  test("rejected preset keeps text and menu with no accepted source change", async () => {
    const f = fixture();
    f.rejected.value = true;
    await choose(f, "24");
    expect(f.onIntent).toHaveBeenCalledTimes(1);
    expect(f.source.snapshot!.values.fontSizePt).toBe(11);
    expect(f.input.element.value).toBe("24");
    expect(f.input.attributes("aria-expanded")).toBe("true");
    expect(f.registry.flush("session-a")).toEqual({ accepted: false });
  });
  test("external revision is stale; real owner reset then typed input and preset use only the new owner", async () => {
    const f = fixture();
    const old = f.wrapper.getComponent(FontFormatField).props("draft")!;
    await f.input.setValue("17");
    f.source.snapshot = {
      ...f.source.snapshot!,
      revision: 2,
      values: { ...f.source.snapshot!.values, fontSizePt: 12 },
    };
    await nextTick();
    await key(f, "Enter");
    expect(f.input.element.value).toBe("17");
    expect(f.onIntent).not.toHaveBeenCalled();
    await key(f, "Escape");
    expect(f.input.element.value).toBe("12");
    f.source.snapshot = {
      ...f.source.snapshot!,
      revision: 3,
      owner: { ...f.source.snapshot!.owner, drawingId: "shape-b", sessionId: "session-b" },
      drawing: { ...f.source.snapshot!.drawing, id: "shape-b" },
      values: { ...f.source.snapshot!.values, fontSizePt: 9 },
    };
    await nextTick();
    expect(old.select(48)).toBe(false);
    await f.input.setValue("21.5");
    await key(f, "Enter");
    await choose(f, "14");
    expect(f.onIntent).toHaveBeenCalledTimes(2);
    for (const [intent] of f.onIntent.mock.calls) expect(intent.owner.sessionId).toBe("session-b");
  });
  test("mixed values remain an empty combo until a real candidate establishes pt", async () => {
    const f = fixture();
    f.source.snapshot = { ...f.source.snapshot!, mixedFields: ["fontSizePt"] };
    await nextTick();
    expect(f.input.element.value).toBe("");
    expect(f.input.attributes("aria-valuenow")).toBeUndefined();
    await choose(f, "18");
    expect(f.onIntent.mock.calls[0]?.[0]).toMatchObject({ field: "fontSizePt", value: 18 });
  });
  test("IME never flushes half composition, and another session cannot flush this draft", async () => {
    const f = fixture();
    f.input.element.focus();
    await f.input.trigger("compositionstart");
    f.input.element.value = "23.5";
    await f.input.trigger("input");
    expect(f.registry.flush("session-a")).toEqual({ accepted: false });
    expect(f.registry.flush("session-other")).toEqual({ accepted: true });
    await key(f, "Enter");
    expect(f.onIntent).not.toHaveBeenCalled();
    await f.input.trigger("compositionend");
    expect(f.registry.flush("session-a")).toEqual({ accepted: true });
    expect(f.onIntent.mock.calls[0]?.[0]).toMatchObject({ field: "fontSizePt", value: 23.5 });
  });
});
