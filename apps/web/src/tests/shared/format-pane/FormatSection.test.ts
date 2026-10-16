import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, expect, test } from "vitest";
import { Collapse, CollapsePanel } from "tdesign-vue-next/es/collapse";
import FormatSection from "../../../shared/format-pane/FormatSection.vue";

const wrappers: VueWrapper[] = [];
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.replaceChildren();
});

test("shared FormatSection uses public Collapse and preserves its field through header/control actions and expand", async () => {
  const wrapper = mount(FormatSection, {
    attachTo: document.body,
    props: { title: "Fill" },
    slots: {
      default: '<input aria-label="Retained field" value="draft" />',
      control: '<button type="button" aria-label="Preset">Preset</button>',
    },
  });
  wrappers.push(wrapper);
  expect(wrapper.findComponent(Collapse).exists()).toBe(true);
  expect(wrapper.findComponent(CollapsePanel).props("destroyOnCollapse")).toBe(false);
  const header = wrapper.get<HTMLButtonElement>("button[aria-expanded]");
  const field = wrapper.get<HTMLInputElement>('input[aria-label="Retained field"]').element;
  expect(header.attributes("aria-expanded")).toBe("false");
  expect(wrapper.get(`#${header.attributes("aria-controls")}`).exists()).toBe(true);
  await header.trigger("click");
  expect(header.attributes("aria-expanded")).toBe("true");
  await wrapper.get('button[aria-label="Preset"]').trigger("click");
  expect(header.attributes("aria-expanded")).toBe("true");
  await header.trigger("click");
  expect(header.attributes("aria-expanded")).toBe("false");
  wrapper.vm.expand();
  await nextTick();
  expect(header.attributes("aria-expanded")).toBe("true");
  expect(wrapper.get('input[aria-label="Retained field"]').element).toBe(field);
  expect(field.value).toBe("draft");
});

test("shared FormatSection respects initiallyOpen without an extra domain state wrapper", () => {
  const wrapper = mount(FormatSection, { props: { title: "Size", initiallyOpen: true } });
  wrappers.push(wrapper);
  expect(wrapper.get("button[aria-expanded]").attributes("aria-expanded")).toBe("true");
});

test("controlled open state changes only after its presentation owner accepts the update", async () => {
  const wrapper = mount(FormatSection, { props: { title: "Paragraph", open: false } });
  wrappers.push(wrapper);
  const heading = wrapper.get("button[aria-expanded]");
  await heading.trigger("click");
  expect(wrapper.emitted("update:open")).toEqual([[true]]);
  expect(heading.attributes("aria-expanded")).toBe("false");
  await wrapper.setProps({ open: true });
  expect(heading.attributes("aria-expanded")).toBe("true");
  await heading.trigger("click");
  expect(wrapper.emitted("update:open")?.at(-1)).toEqual([false]);
});
