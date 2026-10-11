import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import SymbolInsertMenu from "../../../modules/insert-tools/components/SymbolInsertMenu.vue";
import { createAppI18n } from "../../../shared/i18n";
import {
  defaultSymbolPreferences,
  useSymbolPreferences,
  withCustomSymbol,
} from "../../../modules/insert-tools/symbols/symbol-preferences";
const ensureFont = vi.hoisted(() => vi.fn(async (_family: string): Promise<void> => undefined));
vi.mock("../../../shared/cell-text/managed-fonts", async (original) => ({
  ...(await original<object>()),
  ensureManagedCellFont: ensureFont,
}));
vi.mock("../../../shared/cell-text/font-resources", () => ({
  retryCellFontResource: ensureFont,
  getCellFontResourceKind: (family: string) =>
    family.startsWith("Noto Sans")
      ? "managed"
      : /^SheetcraftLocal_[a-f0-9]{64}$/u.test(family)
        ? "local"
        : "system",
}));
const mounted: Array<{ unmount(): void }> = [];
beforeEach(() => {
  ensureFont.mockReset();
  ensureFont.mockResolvedValue(undefined);
  useSymbolPreferences().update(defaultSymbolPreferences());
});
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});
async function fixture(insertText?: (payload: { text: string; fontFamily?: string }) => boolean) {
  const wrapper = mount(SymbolInsertMenu, {
    attachTo: document.body,
    props: { disabled: false, editSessionId: "owner-1", insertText },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  await wrapper.get('[data-insert-tool="symbol"]').trigger("click");
  await flushPromises();
  return wrapper;
}
test("quick menu shows 36 visible defaults and inherits owner identity into the portal", async () => {
  const wrapper = await fixture();
  const portal = document.body.querySelector('[role="menu"]')!;
  expect(portal.getAttribute("data-cell-edit-session")).toBe("owner-1");
  expect(portal.querySelectorAll(".symbol-menu__section:nth-child(2) button")).toHaveLength(36);
  const first = portal.querySelector<HTMLButtonElement>(
    ".symbol-menu__section:nth-child(2) button",
  )!;
  first.click();
  await flushPromises();
  expect(wrapper.emitted("insert")).toEqual([[{ text: "＋" }]]);
  expect(useSymbolPreferences().preferences.value.recent[0]).toEqual({ text: "＋" });
});
test("owner rejection leaves menu and MRU untouched, then More preserves old event contract", async () => {
  const handler = vi.fn(() => false);
  const wrapper = await fixture(handler);
  document.body.querySelector<HTMLButtonElement>(".symbol-menu__grid button")!.click();
  await flushPromises();
  expect(handler).toHaveBeenCalledWith({ text: "▲" });
  expect(wrapper.emitted("insert")).toBeUndefined();
  expect(document.body.querySelector('[role="menu"]')).not.toBeNull();
  const more = [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((item) =>
    item.textContent?.includes("More symbols"),
  )!;
  more.click();
  await flushPromises();
  expect(wrapper.emitted("more")).toEqual([[]]);
});
test("custom visibility changes are reactive and never lose Unicode identity", async () => {
  const wrapper = await fixture();
  const { preferences, update } = useSymbolPreferences();
  update(withCustomSymbol(preferences.value, { text: "👩‍💻" }));
  await wrapper.vm.$nextTick();
  const buttons = [
    ...document.body.querySelectorAll<HTMLButtonElement>(
      ".symbol-menu__section:nth-child(2) button",
    ),
  ];
  expect(buttons[0]?.textContent).toBe("👩‍💻");
  expect(buttons).toHaveLength(37);
});

test("a font load from a dismissed menu cannot insert into a reopened target", async () => {
  let release: () => void = () => undefined;
  ensureFont.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  const store = useSymbolPreferences();
  store.update(
    withCustomSymbol(store.preferences.value, { text: "Ω", fontFamily: "Noto Sans Math" }),
  );
  const first = vi.fn(() => true);
  const second = vi.fn(() => true);
  const wrapper = await fixture(first);
  document.body
    .querySelector<HTMLButtonElement>(".symbol-menu__section:nth-child(2) button")!
    .click();
  await vi.waitFor(() => expect(ensureFont).toHaveBeenCalled());
  await wrapper.get('[data-insert-tool="symbol"]').trigger("click");
  await wrapper.setProps({ insertText: second, editSessionId: "new-owner" });
  await wrapper.get('[data-insert-tool="symbol"]').trigger("click");
  release();
  await flushPromises();
  expect(first).not.toHaveBeenCalled();
  expect(second).not.toHaveBeenCalled();
  expect(store.preferences.value.recent[0]?.text).toBe("▲");
  expect(document.body.querySelector('[role="menu"]')).not.toBeNull();
});
