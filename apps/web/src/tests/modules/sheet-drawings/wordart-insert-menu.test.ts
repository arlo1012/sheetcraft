import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, expect, test, vi } from "vitest";
import WordArtInsertMenu from "../../../modules/sheet-drawings/components/WordArtInsertMenu.vue";
import { WORDART_STYLE_PRESETS } from "../../../modules/sheet-drawings/wordart-style-presets";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import { createAppI18n } from "../../../shared/i18n";

vi.mock("../../../modules/sheet-drawings/components/WordArtStylePreview.vue", () => ({
  default: {
    props: ["choice", "label", "theme"],
    template: '<span aria-hidden="true">{{ label }}</span>',
  },
}));

const mounted: VueWrapper[] = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});

test("the WordArt menu delegates scrolling to MenuSurface and reveals keyboard choices", async () => {
  const wrapper = mount(WordArtInsertMenu, {
    attachTo: document.body,
    props: { ownerId: "sheet", handler: vi.fn(() => true) },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  const trigger = wrapper.get('[data-insert-tool="wordArt"]');
  await trigger.trigger("keydown", { key: "ArrowDown" });
  await nextTick();
  const surface = wrapper.getComponent(MenuSurface);
  expect(surface.props("bodyScrollable")).toBe(true);
  expect(surface.classes()).not.toContain("sheetcraft-menu-surface--contained-body");
  const choices = surface.findAll<HTMLButtonElement>("button[data-wordart-style-choice]");
  expect(choices).toHaveLength(WORDART_STYLE_PRESETS.length);
  expect(document.activeElement).toBe(choices[0]!.element);
  const last = choices.at(-1)!;
  const scrollIntoView = vi.fn();
  last.element.scrollIntoView = scrollIntoView;
  await choices[0]!.trigger("keydown", { key: "End" });
  expect(document.activeElement).toBe(last.element);
  expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: "nearest", inline: "nearest" });
  expect(surface.findAll('button[tabindex="0"]')).toHaveLength(1);
  await last.trigger("keydown", { key: "Escape" });
  await nextTick();
  expect(wrapper.findComponent(MenuSurface).exists()).toBe(false);
  expect(document.activeElement).toBe(trigger.element);
});
