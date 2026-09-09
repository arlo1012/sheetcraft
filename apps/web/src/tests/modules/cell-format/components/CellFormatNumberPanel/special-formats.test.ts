import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import { createDefaultSelectionCellStyleState } from "@idea10/core/style-state";
import type { CellStylePatch } from "@idea10/core/style";
import CellFormatNumberPanel from "../../../../../modules/cell-format/components/CellFormatNumberPanel.vue";
import { createAppI18n } from "../../../../../shared/i18n";

describe("CellFormatNumberPanel special formats", () => {
  test("selects, previews and reopens the distinct Chinese uppercase variants", async () => {
    const state = createDefaultSelectionCellStyleState();
    const wrapper = mount(CellFormatNumberPanel, {
      global: { plugins: [createAppI18n("zh-CN")] },
      props: { state, patch: {}, sampleValue: 12.25 },
    });
    try {
      await wrapper.get('[data-cell-format-number-category="special"]').trigger("click");
      expect(wrapper.findAll("[data-cell-format-type]").map((option) => option.text())).toEqual([
        "邮政编码",
        "中文小写数字",
        "中文大写数字",
        "中文大写数字2",
        "人民币大写",
        "单位：万元",
        "正负号",
      ]);
      await wrapper.get('[data-cell-format-type="[DBNum2][$-804]General"]').trigger("click");
      expect(wrapper.get("[data-cell-format-number-preview]").text()).toBe("壹拾贰点贰伍");

      // The two presets share an XLSX code but must be separate keyboard options.
      await wrapper
        .get('[data-cell-format-type="[DBNum2][$-804]General"]')
        .trigger("keydown", { key: "ArrowDown" });
      const patch = wrapper.emitted("update:patch")!.at(-1)![0] as CellStylePatch;
      expect(patch.numberFormat).toEqual({
        kind: "special",
        code: "[DBNum2][$-804]General",
        locale: "zh-CN",
        chineseUpperStyle: "compact",
      });
      expect(wrapper.get("[data-cell-format-number-preview]").text()).toBe("拾贰点贰伍");
      expect(wrapper.findAll('[data-cell-format-type][aria-selected="true"]')).toHaveLength(1);

      const reopened = mount(CellFormatNumberPanel, {
        global: { plugins: [createAppI18n("zh-CN")] },
        props: { state, patch, sampleValue: 12.25 },
      });
      try {
        expect(
          reopened.get('[data-cell-format-type="chinese-upper-2"]').attributes("aria-selected"),
        ).toBe("true");
        expect(reopened.get("[data-cell-format-number-preview]").text()).toBe("拾贰点贰伍");
        await reopened.get('[data-cell-format-type="[DBNum2][$-804]General"]').trigger("click");
        expect(
          (reopened.emitted("update:patch")!.at(-1)![0] as CellStylePatch).numberFormat,
        ).toEqual({
          kind: "special",
          code: "[DBNum2][$-804]General",
          locale: "zh-CN",
        });
      } finally {
        reopened.unmount();
      }
    } finally {
      wrapper.unmount();
    }
  });

  test("offers every code-based category preset in Custom exactly once", async () => {
    const wrapper = mount(CellFormatNumberPanel, {
      global: { plugins: [createAppI18n("zh-CN")] },
      props: { state: createDefaultSelectionCellStyleState(), patch: {}, sampleValue: 12.3 },
    });
    try {
      const codes: string[] = [];
      for (const category of ["date", "time", "fraction", "special"]) {
        await wrapper.get(`[data-cell-format-number-category="${category}"]`).trigger("click");
        codes.push(
          ...wrapper
            .findAll("[data-cell-format-type]")
            .map((option) => option.attributes("data-cell-format-type"))
            .filter((value): value is string => value !== undefined && value !== "chinese-upper-2"),
        );
      }
      await wrapper.get('[data-cell-format-number-category="custom"]').trigger("click");
      const customCodes = wrapper
        .findAll("[data-cell-format-type]")
        .map((option) => option.attributes("data-cell-format-type"));
      expect(customCodes).toEqual(expect.arrayContaining(codes));
      expect(new Set(customCodes).size).toBe(customCodes.length);
      expect(wrapper.emitted("validity-change")!.at(-1)).toEqual([true]);
    } finally {
      wrapper.unmount();
    }
  });

  test("retains a compact format without locale metadata under an English interface", () => {
    const state = createDefaultSelectionCellStyleState();
    state.numberFormat = {
      mixed: false,
      value: { kind: "special", code: "[DBNum2][$-804]General", chineseUpperStyle: "compact" },
    };
    const wrapper = mount(CellFormatNumberPanel, {
      global: { plugins: [createAppI18n("en-US")] },
      props: { state, patch: {}, sampleValue: 12 },
    });
    try {
      expect(
        wrapper.get('[data-cell-format-type="chinese-upper-2"]').attributes("aria-selected"),
      ).toBe("true");
      expect(wrapper.get("[data-cell-format-number-preview]").text()).toBe("拾贰");
      expect(wrapper.emitted("update:patch")).toBeUndefined();
    } finally {
      wrapper.unmount();
    }
  });
});
