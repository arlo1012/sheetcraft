import { describe, expect, test } from "vitest";
import { mount } from "@vue/test-utils";
import { Button as TButton } from "tdesign-vue-next/es/button";
import CellFormatDialog from "../../../modules/cell-format/components/CellFormatDialog.vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { createBuiltinCellStyles } from "@idea10/core/cell-styles";
import { createAppI18n } from "../../../shared/i18n";
import CellStyleGallery from "../../../modules/cell-styles/components/CellStyleGallery.vue";
import NewCellStyleDialog from "../../../modules/cell-styles/components/NewCellStyleDialog.vue";

describe("cell styles components", () => {
  test("localizes builtins, preserves custom names, and opens custom editing from the keyboard", async () => {
    const custom = {
      id: "custom-report",
      name: "销售看板",
      category: "custom" as const,
      style: {},
    };
    const wrapper = mount(CellStyleGallery, {
      attachTo: document.body,
      props: { styles: [...createBuiltinCellStyles(), custom] },
      global: { plugins: [createAppI18n("zh-CN")] },
    });

    expect(wrapper.get('[data-cell-style-id="good"]').attributes("title")).toBe("好");
    expect(wrapper.text()).not.toContain("cellStyles.builtin.");
    const tile = wrapper.get('[data-cell-style-id="custom-report"]');
    expect(tile.attributes("title")).toContain("销售看板");
    await tile.trigger("keydown", { key: "F10", shiftKey: true });
    expect(wrapper.emitted("edit")).toEqual([[custom]]);
    wrapper.unmount();
    document.body.replaceChildren();
  });

  test("creates an automatically named custom style and retains its supplied format", async () => {
    const wrapper = mount(NewCellStyleDialog, {
      attachTo: document.body,
      props: {
        existingNames: ["Style 1"],
        initialStyle: { fillColor: "#c6efce", bold: true },
      },
      global: { plugins: [createAppI18n("en-US")] },
    });

    expect(
      (wrapper.get("[data-cell-style-name]").find("input").element as HTMLInputElement).value,
    ).toBe("Style 2");
    await wrapper.findComponent(Dialog).vm.$emit("confirm");
    expect(wrapper.emitted("confirm")?.[0]?.[0]).toMatchObject({
      category: "custom",
      name: "Style 2",
      style: { fillColor: "#c6efce", bold: true },
    });
    wrapper.unmount();
    document.body.replaceChildren();
  });
});

test("format confirmation updates only the style draft until the parent confirms", async () => {
  const initialStyle = { fillColor: "#c6efce", horizontalAlign: "right" as const };
  const wrapper = mount(NewCellStyleDialog, {
    attachTo: document.body,
    props: { existingNames: [], initialStyle },
    global: { plugins: [createAppI18n("en-US")] },
  });
  const format = () =>
    wrapper.findAllComponents(TButton).find((button) => button.text() === "Format…")!;
  await format().trigger("click");
  expect(wrapper.findComponent(CellFormatDialog).props("initialStylePatch")).toMatchObject(
    initialStyle,
  );
  await wrapper.findComponent(CellFormatDialog).vm.$emit("confirm", {
    style: { fontSize: 16, underline: true },
    borders: [{ preset: "bottom", border: { style: "thin", color: "#112233" } }],
  });
  expect(wrapper.emitted("confirm")).toBeUndefined();
  expect(initialStyle).toEqual({ fillColor: "#c6efce", horizontalAlign: "right" });
  expect(wrapper.text()).toContain("16");
  await format().trigger("click");
  await wrapper.findComponent(CellFormatDialog).vm.$emit("cancel");
  await wrapper.findComponent(Dialog).vm.$emit("confirm");
  expect(wrapper.emitted("confirm")?.[0]?.[0]).toMatchObject({
    style: {
      ...initialStyle,
      fontSize: 16,
      underline: true,
      borderBottom: { style: "thin", color: "#112233" },
    },
  });
  wrapper.unmount();
  document.body.replaceChildren();
});
