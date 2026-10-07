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
    expect(menu().get('[data-freeze-action="panes"]').text()).toBe(
      "Freeze through row 2, column C",
    );
    await menu().get('[data-freeze-action="panes"]').trigger("click");
    expect(freeze.emitted("freeze")).toEqual([["panes"]]);

    await freeze.setProps({ freeze: { rows: 1, columns: 0 } });
    expect(freezeTrigger.attributes("aria-pressed")).toBe("true");
    await freezeTrigger.trigger("click");
    await menu().get('[data-freeze-action="unfreeze"]').trigger("click");
    expect(freeze.emitted("unfreeze")).toEqual([[]]);
  });

  test.each([
    ["rows", "Freeze through row 2"],
    ["columns", "Freeze through column C"],
  ] as const)("emits %s with the active-cell boundary in its label", async (mode, label) => {
    const wrapper = mountMenu({
      disabled: false,
      activeCell: { row: 2, column: 3 },
      freeze: { rows: 0, columns: 0 },
    });
    await wrapper.get('[data-ribbon-action="freeze"]').trigger("click");
    const action = menu().get(`[data-freeze-action="${mode}"]`);
    expect(action.text()).toBe(label);
    expect(action.attributes("aria-disabled")).toBe("false");
    await action.trigger("click");
    expect(wrapper.emitted("freeze")).toEqual([[mode]]);
  });

  test.each([
    [{ row: 0, column: 0 }, ["panes", "rows", "columns"]],
    [{ row: 0, column: 3 }, ["rows"]],
    [{ row: 2, column: 0 }, ["columns"]],
  ] as const)(
    "disables boundary actions that would freeze nothing at %j",
    async (activeCell, modes) => {
      const wrapper = mountMenu({ disabled: false, activeCell, freeze: { rows: 0, columns: 0 } });
      await wrapper.get('[data-ribbon-action="freeze"]').trigger("click");
      for (const mode of modes) {
        const action = menu().get(`[data-freeze-action="${mode}"]`);
        expect(action.attributes("aria-disabled")).toBe("true");
        await action.trigger("click");
      }
      expect(wrapper.emitted("freeze")).toBeUndefined();
    },
  );
});
