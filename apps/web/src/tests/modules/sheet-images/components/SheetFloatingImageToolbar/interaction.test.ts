import { DOMWrapper, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, test } from "vitest";
import SheetFloatingImageToolbar from "../../../../../modules/sheet-images/components/SheetFloatingImageToolbar.vue";
import { createAppI18n } from "../../../../../shared/i18n";

const mountedWrappers: Array<{ unmount(): void }> = [];

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});

function mountToolbar(options?: { cropping?: boolean; canRestore?: boolean; disabled?: boolean }) {
  const anchor = document.createElement("div");
  document.body.append(anchor);
  const wrapper = mount(SheetFloatingImageToolbar, {
    attachTo: document.body,
    global: { plugins: [createAppI18n("en-US")] },
    props: {
      anchor,
      cropping: options?.cropping ?? false,
      canRestore: options?.canRestore ?? false,
      disabled: options?.disabled ?? false,
    },
  });
  mountedWrappers.push(wrapper);
  return wrapper;
}

function toolbar() {
  return new DOMWrapper(document.body).get(".sheet-floating-image-toolbar");
}

function rotateMenu() {
  return new DOMWrapper(document.body).get(".sheet-floating-image-toolbar__rotate-menu");
}

describe("SheetFloatingImageToolbar", () => {
  test("shows the compact crop, rotate, and restore actions above the image", () => {
    mountToolbar({ canRestore: false });
    const controls = toolbar().findAll(".sheet-floating-image-toolbar__action");

    expect(toolbar().attributes("role")).toBe("toolbar");
    expect(toolbar().attributes("style")).toContain("position: fixed");
    expect(
      controls.map((control) => control.attributes("data-floating-image-toolbar-action")),
    ).toEqual(["crop", "rotate", "restore"]);
    expect(controls[0]?.attributes()).toMatchObject({ "aria-label": "Crop", title: "Crop" });
    expect(controls[1]?.attributes()).toMatchObject({
      "aria-label": "Rotate",
      "aria-haspopup": "menu",
      "aria-expanded": "false",
    });
    expect(controls[2]?.attributes("aria-disabled")).toBe("true");
  });

  test("orders rotation then flip choices and restores focus after keyboard selection", async () => {
    const wrapper = mountToolbar({ canRestore: true });
    const trigger = toolbar().get('[data-floating-image-toolbar-action="rotate"]');
    (trigger.element as HTMLElement).focus();
    await trigger.trigger("keydown", { key: "ArrowDown" });
    await nextTick();

    expect(rotateMenu().attributes("aria-label")).toBe("Rotate");
    expect(document.activeElement).toBe(
      rotateMenu().get('[data-floating-image-rotate="left"]').element,
    );
    expect(
      rotateMenu()
        .findAll("[role=menuitem]")
        .map(
          (item) =>
            item.attributes("data-floating-image-rotate") ??
            item.attributes("data-floating-image-flip"),
        ),
    ).toEqual(["left", "right", "half", "vertical", "horizontal"]);
    await rotateMenu().get('[data-floating-image-flip="vertical"]').trigger("keydown", {
      key: "Enter",
    });
    await nextTick();

    expect(wrapper.emitted("flip")).toEqual([["vertical"]]);
    expect(document.body.querySelector(".sheet-floating-image-toolbar__rotate-menu")).toBeNull();
    expect(document.activeElement).toBe(trigger.element);

    await trigger.trigger("keydown", { key: "ArrowUp" });
    await nextTick();
    const horizontal = rotateMenu().get('[data-floating-image-flip="horizontal"]');
    expect(document.activeElement).toBe(horizontal.element);
    await horizontal.trigger("keydown", { key: "Enter" });
    await nextTick();
    expect(wrapper.emitted("flip")).toEqual([["vertical"], ["horizontal"]]);
    expect(document.body.querySelector(".sheet-floating-image-toolbar__rotate-menu")).toBeNull();
    expect(document.activeElement).toBe(trigger.element);
  });

  test("closes the rotation menu on Escape without leaking its keyboard event to the grid", async () => {
    mountToolbar();
    const trigger = toolbar().get('[data-floating-image-toolbar-action="rotate"]');
    await trigger.trigger("click");
    expect(rotateMenu()).toBeTruthy();

    await rotateMenu().trigger("keydown", { key: "Escape" });
    await nextTick();
    expect(document.body.querySelector(".sheet-floating-image-toolbar__rotate-menu")).toBeNull();
    expect(document.activeElement).toBe(trigger.element);
  });

  test("replaces the strip with crop confirmation controls and cancels crop on Escape", async () => {
    const wrapper = mountToolbar({ cropping: true });
    const controls = toolbar().findAll(".sheet-floating-image-toolbar__action");

    expect(
      controls.map((control) => control.attributes("data-floating-image-toolbar-action")),
    ).toEqual(["apply-crop", "cancel-crop"]);
    await controls[0]!.trigger("click");
    await controls[1]!.trigger("click");
    await controls[1]!.trigger("keydown", { key: "Escape" });

    expect(wrapper.emitted("applyCrop")).toEqual([[]]);
    expect(wrapper.emitted("cancelCrop")).toEqual([[], []]);
  });

  test("disables every action without removing the concise control strip", () => {
    mountToolbar({ disabled: true, canRestore: true });
    for (const control of toolbar().findAll(".sheet-floating-image-toolbar__action")) {
      expect(
        control.attributes("aria-disabled") ??
          (control.element instanceof HTMLButtonElement && control.element.disabled
            ? "true"
            : undefined),
      ).toBe("true");
    }
  });
});
