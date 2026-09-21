import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import { nextTick } from "vue";
import FixedWidthSplitEditor from "../../../../modules/data-tools/components/FixedWidthSplitEditor.vue";
import { createAppI18n } from "../../../../shared/i18n";

const mounted: Array<{ unmount: () => void }> = [];

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.innerHTML = "";
});

function mountEditor(widths: readonly number[] = [2, 3]) {
  const wrapper = mount(FixedWidthSplitEditor, {
    attachTo: document.body,
    props: {
      rows: [{ row: 0, text: "123456789" }],
      widths,
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  return wrapper;
}

function setLeft(element: Element, left: number) {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () =>
      ({
        bottom: 0,
        height: 28,
        left,
        right: left + 280,
        top: 0,
        width: 280,
        x: left,
        y: 0,
      }) as DOMRect,
  });
}

function pointerEvent(type: string, clientX: number): PointerEvent {
  return new MouseEvent(type, { bubbles: true, button: 0, clientX }) as PointerEvent;
}

describe("FixedWidthSplitEditor", () => {
  test("uses the ruler's own offset when adding a break and renders a TDesign table", async () => {
    const editor = mountEditor([2]);
    expect(editor.find(".t-table").exists()).toBe(true);

    const ruler = editor.get(".fixed-width-split-editor__ruler");
    setLeft(ruler.element, 200);
    await ruler.trigger("click", { clientX: 270 });

    expect(editor.emitted("change")?.at(-1)).toEqual([[2, 3]]);
  });

  test("drags a break within the valid range and removes listeners when the drag ends", async () => {
    const editor = mountEditor([2, 3]);
    const ruler = editor.get(".fixed-width-split-editor__ruler");
    setLeft(ruler.element, 100);
    const line = editor.get('[aria-label="Column break after character 2"]');

    await line.trigger("pointerdown", { button: 0 });
    window.dispatchEvent(pointerEvent("pointermove", 0));
    expect(editor.emitted("change")?.at(-1)).toEqual([[1, 4]]);

    window.dispatchEvent(pointerEvent("pointermove", 10_000));
    expect(editor.emitted("change")?.at(-1)).toEqual([[5, 14]]);

    window.dispatchEvent(pointerEvent("pointerup", 10_000));
    const changesAfterStop = editor.emitted("change")?.length;
    window.dispatchEvent(pointerEvent("pointermove", 128));
    await nextTick();
    expect(editor.emitted("change")?.length).toBe(changesAfterStop);
  });

  test("moves and removes a break with the keyboard or double click", async () => {
    const editor = mountEditor([2, 3]);
    const firstLine = editor.get('[aria-label="Column break after character 2"]');

    await firstLine.trigger("keydown", { key: "ArrowRight" });
    expect(editor.emitted("change")?.at(-1)).toEqual([[3, 2]]);

    await firstLine.trigger("keydown", { key: "Delete" });
    expect(editor.emitted("change")?.at(-1)).toEqual([[5]]);

    const secondLine = editor.get('[aria-label="Column break after character 5"]');
    await secondLine.trigger("dblclick");
    expect(editor.emitted("change")?.at(-1)).toEqual([[2]]);
  });
});
