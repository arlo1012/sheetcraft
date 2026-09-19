import { DOMWrapper, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import DuplicateErrorCheckOptionsDialog from "../../../../../modules/data-tools/components/DuplicateErrorCheckOptionsDialog.vue";
import { createAppI18n } from "../../../../../shared/i18n";

const settings = { enabled: true, indicatorColor: null, duplicateEntries: true };
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
    await dialog().get("[data-error-indicator-color-trigger]").trigger("click");
    await dialog().get('[data-color-swatch="#c00000"]').trigger("click");
    await dialog().get("[data-duplicate-error-checks-enabled]").trigger("click");
    await dialog().get("[data-duplicate-error-reset-ignored]").trigger("click");
    await dialog().get("[data-duplicate-error-confirm]").trigger("click");
    expect(wrapper.emitted("confirm")).toEqual([
      [
        {
          settings: { enabled: false, indicatorColor: "#c00000", duplicateEntries: true },
          resetIgnored: true,
        },
      ],
    ]);
  });

  test("renders every unavailable WPS rule disabled and unchecked", () => {
    mountDialog();
    const unavailable = dialog().findAll(".t-checkbox.t-is-disabled");
    expect(unavailable).toHaveLength(12);
    for (const item of unavailable) {
      expect((item.get("input").element as HTMLInputElement).checked).toBe(false);
      expect(item.get("input").attributes("disabled")).toBeDefined();
    }
  });
});
