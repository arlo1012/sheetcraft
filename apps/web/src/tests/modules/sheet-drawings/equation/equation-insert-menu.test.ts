import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import EquationInsertMenu from "../../../../modules/sheet-drawings/equation/EquationInsertMenu.vue";
import { createAppI18n } from "../../../../shared/i18n";

const mounted: VueWrapper[] = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});
function fixture(handler = vi.fn(() => true), extra: Record<string, unknown> = {}) {
  const wrapper = mount(EquationInsertMenu, {
    attachTo: document.body,
    props: { handler, ownerId: "sheet-a", editSessionId: "cell-1", ...extra } as never,
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  return { wrapper, handler };
}
function item(selector: string) {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(selector);
  return element;
}
async function click(selector: string) {
  item(selector).click();
  await nextTick();
  await flushPromises();
}
describe("Insert Equation gallery", () => {
  test("13 localized presets and Insert New Equation select their distinct payloads", async () => {
    const { handler } = fixture(
      vi.fn(() => true),
      { locale: "zh-CN" },
    );
    await click("[data-insert-tool='equation']");
    expect(document.querySelectorAll("[data-equation-preset]")).toHaveLength(13);
    expect(item("[data-equation-preset='quadratic-formula']").getAttribute("aria-label")).toBe(
      "一元二次方程求根公式",
    );
    expect(item("[data-equation-new]").textContent).toBe("插入新公式");
    await click("[data-equation-preset='quadratic-formula']");
    expect(handler).toHaveBeenLastCalledWith("quadratic-formula");
    await click("[data-insert-tool='equation']");
    await click("[data-equation-new]");
    expect(handler).toHaveBeenLastCalledWith(null);
  });
  test("failed insertion stays open and retry closes only on acceptance", async () => {
    const handler = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce({ accepted: true });
    fixture(handler);
    await click("[data-insert-tool='equation']");
    await click("[data-equation-preset='average']");
    expect(item("[role='alert']").textContent).toContain("could not be applied");
    await click("[data-equation-preset='average']");
    expect(document.querySelector("[data-equation-preset]")).toBeNull();
  });
  test("detached old rows cannot insert after close and reopen, owner change, or disable", async () => {
    const { wrapper, handler } = fixture();
    await click("[data-insert-tool='equation']");
    const old = item("[data-equation-preset='average']");
    await click("[data-insert-tool='equation']");
    await click("[data-insert-tool='equation']");
    old.click();
    await flushPromises();
    expect(handler).not.toHaveBeenCalled();
    const previousOwner = item("[data-equation-preset='average']");
    await wrapper.setProps({ ownerId: "sheet-b", editSessionId: "cell-2" });
    await click("[data-insert-tool='equation']");
    previousOwner.click();
    await flushPromises();
    expect(handler).not.toHaveBeenCalled();
    const disabled = item("[data-equation-preset='average']");
    await wrapper.setProps({ disabled: true });
    disabled.click();
    await click("[data-insert-tool='equation']");
    expect(handler).not.toHaveBeenCalled();
    expect(document.querySelector("[data-equation-preset]")).toBeNull();
  });
  test("old async acceptance cannot dismiss a new cell-session popup", async () => {
    let resolve!: (accepted: boolean) => void;
    const handler = vi.fn(
      () =>
        new Promise<boolean>((done) => {
          resolve = done;
        }),
    );
    const { wrapper } = fixture(handler as never);
    await click("[data-insert-tool='equation']");
    item("[data-equation-preset='average']").click();
    await nextTick();
    expect(item("[data-equation-preset='pythagorean-theorem']").hasAttribute("disabled")).toBe(
      true,
    );
    await wrapper.setProps({ editSessionId: "cell-2" });
    await click("[data-insert-tool='equation']");
    resolve(true);
    await flushPromises();
    expect(document.querySelectorAll("[data-equation-preset]")).toHaveLength(13);
    expect(item(".equation-insert-menu").getAttribute("data-cell-edit-session")).toBe("cell-2");
  });
});
