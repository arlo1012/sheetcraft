import { mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { Input } from "tdesign-vue-next/es/input";
import { Button } from "tdesign-vue-next/es/button";
import PictureSelectionPane from "../../../../modules/sheet-images/components/PictureSelectionPane.vue";
import { createAppI18n } from "../../../../shared/i18n";
import { group, picture } from "../group-source-guard-fixture";
import { framedPicture } from "../framed-picture-fixture";

const mounted: VueWrapper[] = [];
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()));

describe("selection pane owned roots", () => {
  test("renders common owner metadata and selects only the root, including select all", async () => {
    const container = { ...group("owner"), altText: "Owned group", hidden: true };
    const wrapper = mount(PictureSelectionPane, {
      props: { images: [picture(), container], selectedIds: [], disabled: false },
      global: { plugins: [createAppI18n("en-US")] },
    });
    mounted.push(wrapper);
    expect(wrapper.findAll(".picture-selection-pane__row")).toHaveLength(2);
    expect(wrapper.find('[aria-label="Owned source"]').exists()).toBe(false);
    const checkbox = wrapper
      .findAllComponents(Checkbox)
      .find((entry) => entry.attributes("aria-label") === "Owned group")!;
    checkbox.vm.$emit("change", true);
    expect(wrapper.emitted("select")).toEqual([[["owner"]]]);
    await wrapper.setProps({ selectedIds: ["owner"] });
    checkbox.vm.$emit("change", false);
    expect(wrapper.emitted("select")?.[1]).toEqual([[]]);
    const name = wrapper
      .findAllComponents(Input)
      .find((entry) => entry.props("modelValue") === "Owned group")!;
    name.vm.$emit("change", "Renamed owner");
    name.vm.$emit("blur", "Renamed owner");
    expect(wrapper.emitted("rename")).toEqual([[container, "Renamed owner"]]);
    const visibility = wrapper
      .findAllComponents(Button)
      .find((entry) => entry.attributes("aria-label") === "Show picture")!;
    visibility.vm.$emit("click");
    expect(wrapper.emitted("visibility")).toEqual([[container]]);
    await wrapper.get(".picture-selection-pane > button").trigger("click");
    expect(wrapper.emitted("select")?.[2]).toEqual([["picture", "owner"]]);
    expect(container.hidden).toBe(true);
    expect(container.altText).toBe("Owned group");
    expect(container).not.toHaveProperty("groupId");
    expect(container).not.toHaveProperty("assetId");
  });

  test("standalone flat membership stays atomic and cannot absorb a container", async () => {
    const container = group("flat");
    const images = [
      { ...picture("a"), groupId: "flat" },
      { ...picture("b"), groupId: "flat", hidden: true },
      { ...framedPicture(), groupId: "flat" },
      container,
    ];
    const wrapper = mount(PictureSelectionPane, {
      props: { images, selectedIds: ["flat", "flat-leaf"], disabled: false },
      global: { plugins: [createAppI18n("en-US")] },
    });
    mounted.push(wrapper);
    const checkbox = wrapper
      .findAllComponents(Checkbox)
      .find((entry) => entry.attributes("aria-label") === "a")!;
    checkbox.vm.$emit("change", true);
    expect(wrapper.emitted("select")).toEqual([[["flat", "a", "b", "framed"]]]);
    await wrapper.setProps({ selectedIds: ["flat", "a", "b", "framed", "flat-leaf"] });
    checkbox.vm.$emit("change", false);
    expect(wrapper.emitted("select")?.[1]).toEqual([["flat"]]);
    const ownerCheckbox = wrapper
      .findAllComponents(Checkbox)
      .find((entry) => entry.attributes("aria-label") === "flat")!;
    ownerCheckbox.vm.$emit("change", false);
    expect(wrapper.emitted("select")?.[2]).toEqual([["a", "b", "framed"]]);
    expect(container.members.map((member) => member.id)).toEqual(["flat-leaf"]);
  });
});
