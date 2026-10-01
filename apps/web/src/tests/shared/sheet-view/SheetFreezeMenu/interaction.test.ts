import { DOMWrapper, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import SheetFreezeMenu from "../../../../shared/sheet-view/SheetFreezeMenu.vue";
import { createAppI18n } from "../../../../shared/i18n";

const wrappers: ReturnType<typeof mount>[] = [];
function mountMenu(props: {
  disabled: boolean;
  activeCell: { row: number; column: number };
  freeze: { rows: number; columns: number };
}) {
  const wrapper = mount(SheetFreezeMenu, {
    attachTo: document.body,
    global: { plugins: [createAppI18n("en-US")] },
    props,
  });
  wrappers.push(wrapper);
  return wrapper;
}
function menu() {
  return new DOMWrapper(document.body).get('[role="menu"]');
}
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});

describe("SheetFreezeMenu", () => {
  test("emits freeze and unfreeze intents from real menu actions", async () => {
    const freeze = mountMenu({
      disabled: false,
      activeCell: { row: 2, column: 3 },
      freeze: { rows: 0, columns: 0 },
    });
    const freezeTrigger = freeze.get('[data-ribbon-action="freeze"]');
    expect(freezeTrigger.attributes("aria-pressed")).toBe("false");
    await freezeTrigger.trigger("click");
    expect(menu().get('[data-freeze-action="panes"]').attributes("aria-disabled")).toBe("false");
    await menu().get('[data-freeze-action="panes"]').trigger("click");
    expect(freeze.emitted("freeze")).toEqual([["panes"]]);

    await freeze.setProps({ freeze: { rows: 1, columns: 0 } });
    expect(freezeTrigger.attributes("aria-pressed")).toBe("true");
    await freezeTrigger.trigger("click");
    await menu().get('[data-freeze-action="unfreeze"]').trigger("click");
    expect(freeze.emitted("unfreeze")).toEqual([[]]);
  });
});
