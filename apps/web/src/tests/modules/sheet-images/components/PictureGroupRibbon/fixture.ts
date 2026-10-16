import { mount, type VueWrapper } from "@vue/test-utils";
import NumericField from "../../../../../shared/numeric-field/NumericField.vue";
import { vi } from "vitest";
import PictureGroupRibbon from "../../../../../modules/sheet-images/components/PictureGroupRibbon.vue";
import { createAppI18n } from "../../../../../shared/i18n";
import { pictureGroup } from "../../picture-group-fixture";

export function fixture() {
  const image = pictureGroup();
  const resizeHandler = vi.fn(() => true);
  const aspectRatioHandler = vi.fn(() => true);
  const wrapper = mount(PictureGroupRibbon, {
    attachTo: document.body,
    props: {
      image,
      geometry: { width: 120, height: 80, angleDeg: 37 },
      draftOwnerKey: 1,
      resizeHandler,
      aspectRatioHandler,
      disabled: false,
      selectionCount: 1,
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  return { image, resizeHandler, aspectRatioHandler, wrapper };
}

export function dimension(
  wrapper: Pick<VueWrapper, "findAllComponents">,
  axis: "width" | "height",
) {
  return wrapper
    .findAllComponents(NumericField)
    .find((input) => input.props("contextAttributes")?.["data-picture-size"] === axis)!;
}

export function listener(value: unknown): (...args: unknown[]) => unknown {
  if (typeof value !== "function") throw new TypeError("Expected a rendered event listener.");
  return (...args) => value(...args);
}
