import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import { defineComponent, nextTick, ref } from "vue";
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

function mountControlledEditor(widths: readonly number[] = [2, 3]) {
  const wrapper = mount(
    defineComponent({
      components: { FixedWidthSplitEditor },
      setup() {
        const currentWidths = ref([...widths]);
        const updateWidths = (next: number[]) => {
          currentWidths.value = next;
        };
        return { currentWidths, updateWidths };
      },
      template: `
        <FixedWidthSplitEditor
          :rows="[{ row: 0, text: '123456789' }]"
          :widths="currentWidths"
          @change="updateWidths"
        />
      `,
    }),
    { attachTo: document.body, global: { plugins: [createAppI18n("en-US")] } },
  );
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

  test("focuses added and moved breaks so keyboard movement and deletion work", async () => {
    const editor = mountControlledEditor([2]);
    const ruler = editor.get(".fixed-width-split-editor__ruler");
    setLeft(ruler.element, 200);
    await ruler.trigger("click", { clientX: 270 });
    await nextTick();

    const addedLine = editor.get('[aria-label="Column break after character 5"]');
    expect(document.activeElement).toBe(addedLine.element);

    const bodyKeydown = vi.fn();
    document.body.addEventListener("keydown", bodyKeydown);
    addedLine.element.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" }),
    );
    await nextTick();

    const movedLine = editor.get('[aria-label="Column break after character 6"]');
    expect(document.activeElement).toBe(movedLine.element);
    expect(bodyKeydown).not.toHaveBeenCalled();

    movedLine.element.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Delete" }));
    await nextTick();
    expect(document.activeElement).toBe(
      editor.get('[aria-label="Column break after character 2"]').element,
    );
    document.body.removeEventListener("keydown", bodyKeydown);
  });

  test("focuses an existing break after pointerdown and keeps double click deletion", async () => {
    const editor = mountControlledEditor([2, 3]);
    const ruler = editor.get(".fixed-width-split-editor__ruler");
    setLeft(ruler.element, 100);
    const firstLine = editor.get('[aria-label="Column break after character 2"]');

    await firstLine.trigger("pointerdown", { button: 0 });
    expect(document.activeElement).toBe(firstLine.element);
    window.dispatchEvent(pointerEvent("pointerup", 100));

    const secondLine = editor.get('[aria-label="Column break after character 5"]');
    await secondLine.trigger("dblclick");
    await nextTick();
    expect(editor.find('[aria-label="Column break after character 5"]').exists()).toBe(false);
    expect(document.activeElement).toBe(
      editor.get('[aria-label="Column break after character 2"]').element,
    );
  });
});
