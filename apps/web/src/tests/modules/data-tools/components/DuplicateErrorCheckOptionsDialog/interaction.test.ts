import { DOMWrapper, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import DuplicateErrorCheckOptionsDialog from "../../../../../modules/data-tools/components/DuplicateErrorCheckOptionsDialog.vue";
import { createAppI18n } from "../../../../../shared/i18n";

const wrappers: ReturnType<typeof mount>[] = [];

function mountDialog(ignoredCount = 2) {
  const wrapper = mount(DuplicateErrorCheckOptionsDialog, {
    attachTo: document.body,
    global: { plugins: [createAppI18n("en-US")] },
    props: { visible: true, enabled: true, ignoredCount },
  });
  wrappers.push(wrapper);
  return wrapper;
}

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});

describe("DuplicateErrorCheckOptionsDialog", () => {
  test("updates error checking immediately and resets ignored errors", async () => {
    const wrapper = mountDialog();
    const dialog = new DOMWrapper(document.body).get('[role="dialog"]');
    expect(dialog.text()).toContain("Only checks existing values");
    await dialog.get(".t-checkbox").trigger("click");
    expect(wrapper.emitted("update:enabled")).toEqual([[false]]);
    await dialog.get("[data-duplicate-error-reset-ignored]").trigger("click");
    expect(wrapper.emitted("resetIgnored")).toEqual([[]]);
  });

  test("disables resetting when there are no ignored errors", () => {
    mountDialog(0);
    expect(
      new DOMWrapper(document.body)
        .get("[data-duplicate-error-reset-ignored]")
        .attributes("disabled"),
    ).toBeDefined();
  });
});
