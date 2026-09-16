import { mount } from "@vue/test-utils";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { afterEach, describe, expect, test } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import TextToColumnsDialog from "../../../../modules/data-tools/components/TextToColumnsDialog.vue";
import { createAppI18n } from "../../../../shared/i18n";

let wrapper: ReturnType<typeof mount> | undefined;

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  document.body.innerHTML = "";
});

function mountDialog(preview = ["001", "North"]): ReturnType<typeof mount> {
  wrapper = mount(TextToColumnsDialog, {
    attachTo: document.body,
    props: { visible: true, preview, destinationLabel: "A" },
    global: { plugins: [createAppI18n("en-US")] },
  });
  return wrapper;
}

describe("TextToColumnsDialog column types", () => {
  test("defaults every preview column to General and emits Text selection with the draft", async () => {
    const dialog = mountDialog();
    const selects = dialog.findAllComponents(TSelect);
    expect(selects).toHaveLength(2);
    expect(selects.map((select) => select.props("value"))).toEqual(["general", "general"]);

    selects[0]!.vm.$emit("change", "text");
    await nextTick();
    dialog.getComponent(Dialog).vm.$emit("confirm");

    expect(dialog.emitted("apply")?.at(-1)?.[0]).toMatchObject({
      columnTypes: ["text", "general"],
      delimiters: [","],
      fixedWidths: [],
    });
  });

  test("keeps existing selections while extending preview column types", async () => {
    const dialog = mountDialog(["001"]);
    dialog.getComponent(TSelect).vm.$emit("change", "text");
    await nextTick();
    await dialog.setProps({ preview: ["001", "North", "2026"] });

    expect(dialog.findAllComponents(TSelect).map((select) => select.props("value"))).toEqual([
      "text",
      "general",
      "general",
    ]);
  });

  test("does not emit repeatedly when a parent returns a new preview array of the same length", async () => {
    const preview = ref(["001", "North"]);
    const draftChangeCount = ref(0);
    wrapper = mount(
      defineComponent({
        setup() {
          return () =>
            h(TextToColumnsDialog, {
              visible: true,
              // Deliberately model the controller's computed preview, which
              // allocates a new array on every parent render.
              preview: [...preview.value],
              onDraftChange: () => {
                draftChangeCount.value += 1;
                preview.value = [...preview.value];
              },
            });
        },
      }),
      { attachTo: document.body, global: { plugins: [createAppI18n("en-US")] } },
    );
    await nextTick();
    const initialCount = draftChangeCount.value;
    wrapper
      .getComponent(TextToColumnsDialog)
      .findAllComponents(TSelect)[0]!
      .vm.$emit("change", "text");
    await nextTick();
    await nextTick();
    await nextTick();

    expect(draftChangeCount.value).toBe(initialCount + 1);
  });
});
