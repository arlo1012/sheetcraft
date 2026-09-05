import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, watch } from "vue";
import { describe, expect, test, vi } from "vitest";
import SheetImagePreview from "../../../../../modules/sheet-images/components/SheetImagePreview.vue";
import { createAppI18n } from "../../../../../shared/i18n";

const viewerVisibleValues: boolean[] = [];

vi.mock("tdesign-vue-next/es/image-viewer", () => ({
  ImageViewer: defineComponent({
    name: "TImageViewer",
    props: {
      attach: String,
      closeOnEscKeydown: Boolean,
      closeOnOverlay: Boolean,
      images: Array,
      title: String,
      visible: Boolean,
      zIndex: Number,
    },
    emits: ["close"],
    setup(props, { emit }) {
      watch(
        () => props.visible,
        (visible) => viewerVisibleValues.push(visible),
        { immediate: true },
      );
      return () =>
        h(
          "button",
          {
            "data-image-viewer": "",
            "data-src": (props.images?.[0] as { mainImage?: string } | undefined)?.mainImage,
            "data-attach": props.attach,
            "data-close-esc": String(props.closeOnEscKeydown),
            "data-close-overlay": String(props.closeOnOverlay),
            "data-image-count": String(props.images?.length),
            "data-visible": String(props.visible),
            "data-z-index": String(props.zIndex),
            onClick: () => emit("close"),
          },
          props.title,
        );
    },
  }),
}));

function mountPreview(props?: Partial<{ src: string; altText: string; visible: boolean }>) {
  return mount(SheetImagePreview, {
    props: { src: "blob:diagram", altText: "Diagram", ...props },
    global: { plugins: [createAppI18n("en-US")] },
  });
}

describe("SheetImagePreview", () => {
  test("mounts the resolved viewer hidden, then reveals it for TDesign focus handling", async () => {
    viewerVisibleValues.length = 0;
    mountPreview();
    await flushPromises();
    await flushPromises();
    expect(viewerVisibleValues).toEqual([false, true]);
  });

  test("defers the viewer until visible and passes one fullscreen image", async () => {
    viewerVisibleValues.length = 0;
    const wrapper = mountPreview({ visible: false });
    await flushPromises();
    expect(wrapper.find("[data-image-viewer]").exists()).toBe(false);

    await wrapper.setProps({ visible: true });
    await flushPromises();
    const viewer = wrapper.get("[data-image-viewer]");
    expect(viewer.attributes()).toMatchObject({
      "data-src": "blob:diagram",
      "data-attach": "body",
      "data-close-esc": "true",
      "data-close-overlay": "true",
      "data-image-count": "1",
      "data-visible": "true",
      "data-z-index": "1100",
    });
    expect(viewer.text()).toBe("Diagram");
  });

  test("uses the localized preview title when alt text is empty and relays close", async () => {
    viewerVisibleValues.length = 0;
    const wrapper = mountPreview({ altText: "" });
    await flushPromises();
    const viewer = wrapper.get("[data-image-viewer]");
    expect(viewer.text()).toBe("Image preview");
    await viewer.trigger("click");
    expect(wrapper.emitted("close")).toEqual([[]]);
  });
});
