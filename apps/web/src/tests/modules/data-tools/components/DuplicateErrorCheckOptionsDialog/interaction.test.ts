import { DOMWrapper, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import DuplicateErrorCheckOptionsDialog from "../../../../../modules/data-tools/components/DuplicateErrorCheckOptionsDialog.vue";
import {
  DEFAULT_ERROR_CHECK_SETTINGS,
  ERROR_CHECK_RULE_KEYS,
} from "../../../../../modules/data-tools/duplicate-error-preferences";
import ColorPaletteSelect from "../../../../../shared/color/ColorPaletteSelect.vue";
import { createAppI18n } from "../../../../../shared/i18n";

const settings = { ...DEFAULT_ERROR_CHECK_SETTINGS };
const wrappers: ReturnType<typeof mount>[] = [];
function mountDialog(ignoredCount = 2) {
  const wrapper = mount(DuplicateErrorCheckOptionsDialog, {
    attachTo: document.body,
    global: { plugins: [createAppI18n("en-US")] },
    props: { visible: true, settings, ignoredCount },
  });
  wrappers.push(wrapper);
  return wrapper;
}
function dialog() {
  return new DOMWrapper(document.body).get('[role="dialog"]');
}
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});

describe("DuplicateErrorCheckOptionsDialog", () => {
  test("does not save settings when cancelled", async () => {
    const wrapper = mountDialog();
    await dialog().get("[data-duplicate-error-checks-enabled]").trigger("click");
    await dialog().get("[data-duplicate-error-cancel]").trigger("click");
    expect(wrapper.emitted("confirm")).toBeUndefined();
    expect(wrapper.emitted("close")).toEqual([[]]);
  });

  test("restores the original draft when reopened", async () => {
    const wrapper = mountDialog();
    await dialog().get("[data-duplicate-error-checks-enabled]").trigger("click");
    await wrapper.setProps({ visible: false });
    await wrapper.setProps({ visible: true });
    expect(
      (dialog().get("[data-duplicate-error-checks-enabled] input").element as HTMLInputElement)
        .checked,
    ).toBe(true);
  });

  test("confirms settings and deferred ignored-record clearing as one payload", async () => {
    const wrapper = mountDialog(3);
    wrapper.getComponent(ColorPaletteSelect).vm.$emit("select", "#c00000");
    await dialog().get("[data-duplicate-error-checks-enabled]").trigger("click");
    await dialog().get("[data-duplicate-error-reset-ignored]").trigger("click");
    await dialog().get("[data-duplicate-error-confirm]").trigger("click");
    expect(wrapper.emitted("confirm")).toEqual([
      [
        {
          settings: {
            ...DEFAULT_ERROR_CHECK_SETTINGS,
            enabled: false,
            indicatorColor: "#c00000",
          },
          resetIgnored: true,
        },
      ],
    ]);
  });

  test("renders all 13 rules enabled and configurable without TODO placeholders", async () => {
    const wrapper = mountDialog();
    const rules = dialog().findAll("[data-error-check-rule]");
    expect(rules).toHaveLength(ERROR_CHECK_RULE_KEYS.length);
    for (const rule of rules) {
      expect(rule.get("input").attributes("disabled")).toBeUndefined();
    }
    expect(dialog().text()).not.toContain("TODO");
    await dialog().get("[data-duplicate-error-select-all]").trigger("click");
    await dialog().get("[data-duplicate-error-confirm]").trigger("click");
    expect(wrapper.emitted("confirm")?.[0]?.[0]).toMatchObject({
      settings: { formulaRefersToEmpty: true },
    });
  });

  test("allows any rule such as numeric-text or formula-error to be toggled independently", async () => {
    const wrapper = mountDialog();
    const numericRule = dialog().get('[data-error-check-rule="numberStoredAsText"]');
    const formulaErrorRule = dialog().get('[data-error-check-rule="formulaError"]');
    await numericRule.trigger("click");
    await formulaErrorRule.trigger("click");
    await dialog().get("[data-duplicate-error-confirm]").trigger("click");
    expect(wrapper.emitted("confirm")?.[0]?.[0]).toMatchObject({
      settings: {
        numberStoredAsText: false,
        formulaError: false,
        duplicateEntries: true,
      },
    });
  });
});
