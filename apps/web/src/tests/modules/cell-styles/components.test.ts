import { describe, expect, test } from "vitest";
import { DOMWrapper, mount } from "@vue/test-utils";
import { Button as TButton } from "tdesign-vue-next/es/button";
import CellFormatDialog from "../../../modules/cell-format/components/CellFormatDialog.vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { createBuiltinCellStyles } from "@idea10/core/cell-styles";
import { createAppI18n } from "../../../shared/i18n";
import CellStyleGallery from "../../../modules/cell-styles/components/CellStyleGallery.vue";
import CellStylesMenu from "../../../modules/cell-styles/components/CellStylesMenu.vue";
import NewCellStyleDialog from "../../../modules/cell-styles/components/NewCellStyleDialog.vue";

describe("cell styles components", () => {
  test("localizes builtins, preserves custom names, and exposes custom actions", async () => {
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
    await tile.trigger("contextmenu");
    await new DOMWrapper(document.body).get('[data-custom-style-action="delete"]').trigger("click");
    expect(wrapper.emitted("delete")).toEqual([[custom]]);
    wrapper.unmount();
    document.body.replaceChildren();
  });

  test("keeps the parent menu open while deleting a custom style from its teleported context menu", async () => {
    const custom = {
      id: "custom-report",
      name: "Report",
      category: "custom" as const,
      style: {},
    };
    const wrapper = mount(CellStylesMenu, {
      attachTo: document.body,
      props: { customStyles: [custom] },
      global: { plugins: [createAppI18n("en-US")] },
    });
    await wrapper.get('[data-ribbon-action="cell-styles"]').trigger("click");
    const body = new DOMWrapper(document.body);
    await body.get('[data-cell-style-id="custom-report"]').trigger("contextmenu");
    const action = body.get('[data-custom-style-action="delete"]');
    await action.trigger("pointerdown");
    await action.trigger("click");
    expect(wrapper.emitted("delete")).toEqual([[custom]]);
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

test("saves the selected style groups while retaining the complete format draft", async () => {
  const wrapper = mount(NewCellStyleDialog, {
    attachTo: document.body,
    props: {
      existingNames: [],
      initialStyle: {
        numberFormat: { kind: "custom", code: "#,##0.00;[Red]-#,##0.00" },
        horizontalAlign: "center",
        verticalAlign: "middle",
        wrapText: true,
        indent: 2,
        textRotation: 45,
        fillColor: "#c6efce",
        borderBottom: { style: "thin", color: "#112233" },
      },
    },
    global: { plugins: [createAppI18n("en-US")] },
  });

  expect(wrapper.text()).toContain("#,##0.00;[Red]-#,##0.00");
  expect(wrapper.text()).toContain("Wrap text");
  expect(wrapper.text()).toContain("Indent 2");
  expect(wrapper.text()).toContain("Rotation 45°");
  expect(wrapper.text()).toContain("Bottom: thin #112233");

  for (const group of ["alignment", "font", "border", "fill"]) {
    await wrapper.get(`[data-cell-style-include="${group}"] input`).setValue(false);
  }
  await wrapper.findComponent(Dialog).vm.$emit("confirm");
  expect(wrapper.emitted("confirm")?.[0]?.[0]).toMatchObject({
    includes: ["number"],
    style: {
      fillColor: "#c6efce",
      borderBottom: { style: "thin", color: "#112233" },
    },
  });
  wrapper.unmount();
  document.body.replaceChildren();
});

test("uses explicit style groups when editing and treats legacy styles as all groups", () => {
  const explicit = mount(NewCellStyleDialog, {
    attachTo: document.body,
    props: {
      existingNames: ["Number only"],
      style: {
        id: "number-only",
        name: "Number only",
        category: "custom",
        includes: ["number"],
        style: { numberFormat: { kind: "percent", fractionDigits: 1 } },
      },
      initialStyle: {},
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  expect(
    (explicit.get('[data-cell-style-include="number"] input').element as HTMLInputElement).checked,
  ).toBe(true);
  expect(
    (explicit.get('[data-cell-style-include="font"] input').element as HTMLInputElement).checked,
  ).toBe(false);
  explicit.unmount();
  document.body.replaceChildren();

  const legacy = mount(NewCellStyleDialog, {
    attachTo: document.body,
    props: {
      existingNames: ["Legacy"],
      style: { id: "legacy", name: "Legacy", category: "custom", style: {} },
      initialStyle: {},
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  for (const group of ["number", "alignment", "font", "border", "fill"]) {
    expect(
      (legacy.get(`[data-cell-style-include="${group}"] input`).element as HTMLInputElement)
        .checked,
    ).toBe(true);
  }
  legacy.unmount();
  document.body.replaceChildren();
});
