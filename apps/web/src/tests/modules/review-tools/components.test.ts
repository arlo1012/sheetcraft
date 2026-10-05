import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import { nextTick } from "vue";
import ReviewToolbar from "../../../modules/review-tools/components/ReviewToolbar.vue";
import { createAppI18n } from "../../../shared/i18n";

let wrapper: ReturnType<typeof mount> | undefined;
afterEach(() => {
  wrapper?.unmount();
  document.body.replaceChildren();
});
function mountToolbar(readOnly = false) {
  wrapper = mount(ReviewToolbar, {
    attachTo: document.body,
    props: { busy: false, readOnly, hasNote: true, hasNotes: true, showActiveNote: true },
    global: { plugins: [createAppI18n("en-US")] },
  });
  return wrapper;
}
async function choose(action: string) {
  const item = document.body.querySelector<HTMLElement>(`[data-review-action="${action}"]`)!;
  expect(item).not.toBeNull();
  item.click();
  await nextTick();
}
describe("review note menus", () => {
  test("allows current/all-note visibility on locked sheets while disabling reset", async () => {
    const toolbar = mountToolbar(true);
    expect(toolbar.get('[data-review-action="reset-note"]').attributes("disabled")).toBeDefined();
    await choose("note-visibility");
    expect(
      document.body.querySelector('[data-review-action="toggle-note"]')?.textContent,
    ).toContain("Hide Note");
    await choose("toggle-note");
    expect(toolbar.emitted("toggleNote")).toEqual([[]]);
    await choose("note-visibility");
    await choose("show-all-notes");
    expect(toolbar.emitted("showAllNotes")).toEqual([[]]);
    await choose("note-visibility");
    await choose("hide-all-notes");
    expect(toolbar.emitted("hideAllNotes")).toEqual([[]]);
    await toolbar.setProps({ hasNote: false });
    await choose("note-visibility");
    expect(
      document.body
        .querySelector('[data-review-action="toggle-note"]')
        ?.getAttribute("aria-disabled"),
    ).toBe("true");
  });
  test("offers independent position and size resets and disables reset without a note", async () => {
    const toolbar = mountToolbar();
    for (const action of ["reset-note-position", "reset-note-size", "reset-note-box"]) {
      await choose("reset-note");
      await choose(action);
    }
    expect(toolbar.emitted("resetNoteBox")).toEqual([["position"], ["size"], ["all"]]);
    await toolbar.setProps({ hasNote: false });
    expect(toolbar.get('[data-review-action="reset-note"]').attributes("disabled")).toBeDefined();
  });
});
