import { DOMWrapper, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import DataFillTool from "../../../../../modules/data-tools/components/DataFillTool.vue";
import { createAppI18n } from "../../../../../shared/i18n";

const mounted: Array<{ host: HTMLElement; wrapper: ReturnType<typeof mount> }> = [];

function mountTool(disabled = false) {
  const host = document.createElement("div");
  document.body.append(host);
  const wrapper = mount(DataFillTool, {
    attachTo: host,
    global: { plugins: [createAppI18n("en-US")] },
    props: { disabled, canFillRows: true, canFillColumns: true },
  });
  mounted.push({ host, wrapper });
  return wrapper;
}

function rootMenu() {
  return new DOMWrapper(document.body).get('ul[id^="data-fill-"]:not([id^="data-fill-submenu-"])');
}

function submenu() {
  return new DOMWrapper(document.body).get('ul[id^="data-fill-submenu-"]');
}

afterEach(() => {
  vi.useRealTimers();
  for (const { host, wrapper } of mounted.splice(0)) {
    wrapper.unmount();
    host.remove();
  }
  document.body.replaceChildren();
});

describe("DataFillTool", () => {
  test("keeps common fill commands in their ribbon-menu order", async () => {
    const wrapper = mountTool();
    await wrapper.get('[data-data-action="fill"]').trigger("click");
    await nextTick();

    expect(
      rootMenu()
        .findAll("[data-data-fill]")
        .map((item) => item.attributes("data-data-fill")),
    ).toEqual([
      "down",
      "right",
      "up",
      "left",
      "number-sequence",
      "rank",
      "blanks",
      "insert-text",
      "current-date",
      "series",
    ]);

    await rootMenu().get('[data-data-fill="number-sequence"]').trigger("click");
    expect(wrapper.emitted("numberSequence")).toEqual([[]]);

    await wrapper.get('[data-data-action="fill"]').trigger("click");
    await rootMenu().get('[data-data-fill="rank"]').trigger("click");
    expect(wrapper.emitted("rank")).toEqual([[]]);
  });

  test("opens the text submenu and publishes its selected insertion position", async () => {
    const wrapper = mountTool();
    await wrapper.get('[data-data-action="fill"]').trigger("click");
    await rootMenu().get('[data-data-fill="insert-text"]').trigger("click");
    await nextTick();

    expect(
      submenu()
        .findAll("[data-data-fill]")
        .map((item) => item.text()),
    ).toEqual(["Insert at start", "Insert at position", "Insert at end"]);
    await submenu().get('[data-data-fill="insert-at-index"]').trigger("click");
    expect(wrapper.emitted("insertText")).toEqual([["index"]]);

    for (const [item, position] of [
      ["insert-at-start", "start"],
      ["insert-at-end", "end"],
    ] as const) {
      await wrapper.get('[data-data-action="fill"]').trigger("click");
      await rootMenu().get('[data-data-fill="insert-text"]').trigger("click");
      await submenu().get(`[data-data-fill="${item}"]`).trigger("click");
      expect(wrapper.emitted("insertText")?.at(-1)).toEqual([position]);
    }
  });

  test("publishes each current-date shortcut with a current date sample", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 21, 9));
    const wrapper = mountTool();
    await wrapper.get('[data-data-action="fill"]').trigger("click");
    await rootMenu().get('[data-data-fill="current-date"]').trigger("click");
    await nextTick();

    expect(
      submenu()
        .findAll("[data-data-fill]")
        .map((item) => item.text()),
    ).toEqual([
      "2026年9月21日",
      "2026-9-21",
      "2026.9.21",
      "2026/9/21",
      "20260921",
      "2026年09月21日",
      "2026-09-21",
      "2026.09.21",
      "2026/09/21",
    ]);

    await submenu().get('[data-data-fill="date-format-chinese-padded"]').trigger("click");
    expect(wrapper.emitted("currentDate")).toEqual([["yyyy年mm月dd日"]]);
  });

  test("supports right and left submenu navigation, then closes the whole menu on Escape", async () => {
    const wrapper = mountTool();
    const trigger = wrapper.get<HTMLElement>('[data-data-action="fill"]');
    await trigger.trigger("click");
    const text = rootMenu().get<HTMLElement>('[data-data-fill="insert-text"]');
    text.element.focus();
    await text.trigger("keydown", { key: "ArrowRight" });
    await nextTick();
    expect(document.activeElement).toBe(
      submenu().get<HTMLElement>('[data-data-fill="insert-at-start"]').element,
    );

    await submenu().trigger("keydown", { key: "ArrowLeft" });
    await nextTick();
    expect(document.activeElement).toBe(text.element);
    expect(document.body.querySelector('[id^="data-fill-submenu-"]')).toBeNull();

    await text.trigger("keydown", { key: "ArrowRight" });
    await submenu().trigger("keydown", { key: "Escape" });
    await nextTick();
    expect(document.body.querySelector('[id^="data-fill-"]')).toBeNull();
    expect(document.activeElement).toBe(trigger.element);
  });

  test("closes a cascading menu when the tool becomes unavailable", async () => {
    const wrapper = mountTool();
    await wrapper.get('[data-data-action="fill"]').trigger("click");
    await rootMenu().get('[data-data-fill="current-date"]').trigger("click");
    await wrapper.setProps({ disabled: true });
    await nextTick();

    expect(document.body.querySelector('[id^="data-fill-"]')).toBeNull();
  });
});
