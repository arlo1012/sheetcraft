import { afterEach, describe, expect, test } from "vitest";
import { defineComponent, h, ref } from "vue";
import { DOMWrapper, mount } from "@vue/test-utils";
import { createAppI18n } from "../../../../shared/i18n";
import FilterColumnPanel from "../../../../modules/data-tools/components/FilterColumnPanel.vue";
import {
  readFilterPanelSettings,
  type FilterPanelSettings,
} from "../../../../shared/filter/filter-panel-settings";

const values = [
  { key: { kind: "string" as const, value: "Alpha" }, label: "Alpha", count: 2 },
  { key: { kind: "string" as const, value: "Beta" }, label: "Beta", count: 1 },
  { key: { kind: "string" as const, value: "Gamma" }, label: "Gamma", count: 3 },
];
let wrapper: ReturnType<typeof mount> | undefined;

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  document.body.replaceChildren();
  localStorage.clear();
});

function mountPanel(
  overrides: Partial<{
    settings: Partial<FilterPanelSettings>;
    includesMergedCells: boolean;
  }> = {},
) {
  const initialSettings = { ...readFilterPanelSettings(), ...overrides.settings };
  const appliedKeys = values.map((value) => value.key);
  const Harness = defineComponent({
    setup() {
      const settings = ref(initialSettings);
      return () =>
        h(FilterColumnPanel, {
          visible: true,
          columnLabel: "Team (A)",
          values,
          appliedKeys,
          preferredKind: "text",
          hasCriteria: false,
          canSort: true,
          settings: settings.value,
          includesMergedCells: overrides.includesMergedCells ?? false,
          "onUpdate:settings": (next: FilterPanelSettings) => (settings.value = next),
        });
    },
  });
  wrapper = mount(Harness, {
    attachTo: document.body,
    global: { plugins: [createAppI18n("en-US")] },
  });
  return wrapper;
}

function panel() {
  return new DOMWrapper(document.body).get(".filter-column-panel");
}

function button(label: string) {
  return new DOMWrapper(document.body)
    .findAll("button")
    .find((item) => item.text().trim() === label)!;
}

async function openSettings() {
  await new DOMWrapper(document.body).get('[aria-label="Filter settings"]').trigger("click");
  return new DOMWrapper(document.body).get(".filter-settings-menu");
}

async function chooseSetting(label: string) {
  const menu = new DOMWrapper(document.body).get(".filter-settings-menu");
  await menu
    .findAll('[role="menuitemcheckbox"]')
    .find((item) => item.text().trim() === label)!
    .trigger("click");
}

function valueOrder() {
  return new DOMWrapper(document.body)
    .findAll(".filter-value-list__label")
    .map((item) => item.text());
}

describe("filter-column settings", () => {
  test("updates count, total, and criteria visibility without resetting an edited search", async () => {
    mountPanel();
    const search = new DOMWrapper(document.body).get('input[type="search"]');
    await search.setValue("Alpha");
    const alpha = new DOMWrapper(document.body).get(".filter-value-list__row input");
    await alpha.trigger("click");
    await openSettings();
    await chooseSetting("Show item counts");
    await chooseSetting("Show total item count");
    await chooseSetting("Show filter criteria");

    expect((search.element as HTMLInputElement).value).toBe("Alpha");
    expect((alpha.element as HTMLInputElement).checked).toBe(false);
    expect(
      new DOMWrapper(document.body).findAll(".filter-value-list__row .filter-value-list__count"),
    ).toHaveLength(0);
    expect(panel().text()).toContain("0 of 2 records selected");
    expect(panel().get(".filter-column-panel__summary").text()).toBe("0 of 2 records selected");
    const bottom = panel().get(".filter-column-panel__bottom");
    expect(bottom.element.firstElementChild?.className).toBe("filter-column-panel__criteria");
    expect(panel().text()).toContain("Search values：Alpha");
  });

  test("sort menu actions reorder values and Escape closes only the settings menu", async () => {
    mountPanel();
    await openSettings();
    const sortItems = new DOMWrapper(document.body)
      .get(".filter-settings-menu")
      .findAll('[role="menuitemradio"]');
    expect(sortItems.map((item) => item.attributes("aria-checked"))).toEqual(["false", "true"]);
    await new DOMWrapper(document.body)
      .get(".filter-settings-menu")
      .findAll('[role="menuitemradio"]')
      .find((item) => item.text().trim() === "Sort by count, descending")!
      .trigger("click");
    expect(valueOrder()).toEqual(["Gamma", "Alpha", "Beta"]);

    await openSettings();
    expect(
      new DOMWrapper(document.body)
        .get(".filter-settings-menu")
        .findAll('[role="menuitemradio"]')
        .map((item) => item.attributes("aria-checked")),
    ).toEqual(["true", "false"]);
    await new DOMWrapper(document.body)
      .get(".filter-settings-menu")
      .findAll('[role="menuitemradio"]')
      .find((item) => item.text().trim() === "Sort by name, ascending")!
      .trigger("click");
    expect(valueOrder()).toEqual(["Alpha", "Beta", "Gamma"]);

    await openSettings();
    expect(
      new DOMWrapper(document.body)
        .get(".filter-settings-menu")
        .findAll('[role="menuitemradio"]')
        .map((item) => item.attributes("aria-checked")),
    ).toEqual(["false", "true"]);
    await new DOMWrapper(document.body).get(".filter-settings-menu").trigger("keydown", {
      key: "Escape",
    });

    expect(new DOMWrapper(document.body).find(".filter-settings-menu").exists()).toBe(false);
    expect(panel().element.isConnected).toBe(true);
  });

  test("opens the Sort dialog from the color-sort menu without applying a sort", async () => {
    const w = mountPanel();
    const search = new DOMWrapper(document.body).get('input[type="search"]');
    await search.setValue("Alpha");
    await button("Sort by color").trigger("click");
    expect((search.element as HTMLInputElement).value).toBe("Alpha");
    expect(button("Sort by color").attributes("aria-haspopup")).toBe("menu");
    expect(w.findComponent(FilterColumnPanel).emitted("openSort")).toBeUndefined();
    const menu = new DOMWrapper(document.body).get(".filter-color-sort-menu");
    await menu
      .findAll('[role="menuitem"]')
      .find((item) => item.text().trim() === "Custom sort")!
      .trigger("click");
    expect(w.findComponent(FilterColumnPanel).emitted("openSort")?.[0]).toEqual([]);
    expect(w.findComponent(FilterColumnPanel).emitted("sort")).toBeUndefined();
    expect(new DOMWrapper(document.body).find(".filter-color-sort-menu").exists()).toBe(false);
  });

  test("blocks merged-cell filtering until the preference is enabled, then applies it", async () => {
    const w = mountPanel({ settings: { allowMergedCells: false }, includesMergedCells: true });
    expect(panel().text()).toContain("merged cells");
    expect(button("Apply").attributes("disabled")).toBeDefined();

    await openSettings();
    await chooseSetting("Allow filtering merged cells");
    expect(button("Apply").attributes("disabled")).toBeUndefined();
    await button("Apply").trigger("click");
    expect(w.findComponent(FilterColumnPanel).emitted("apply")?.[0]).toEqual([
      { includedKeys: values.map((value) => value.key), allowMergedCells: true },
    ]);
  });
});
