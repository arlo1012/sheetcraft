import { mount } from "@vue/test-utils";
import { defineComponent, h, ref } from "vue";
import { describe, expect, test, vi } from "vitest";
import {
  createShapeTextFieldDrafts,
  shapeTextFieldDraftsKey,
  useShapeTextFieldDraft,
} from "../../../modules/sheet-drawings/shape-text-field-drafts";

describe("exact-owner private field draft flush registry", () => {
  test("flushes only matching registered/current fields and unregister is idempotent", () => {
    const drafts = createShapeTextFieldDrafts();
    const flush = vi.fn(() => true),
      foreign = vi.fn(() => true),
      focus = vi.fn();
    const unregister = drafts.register({
      owner: "shape-text-1",
      current: () => true,
      flush,
      focus,
    });
    drafts.register({ owner: "shape-text-2", current: () => true, flush: foreign, focus });
    expect(drafts.flush("shape-text-1")).toEqual({ accepted: true });
    expect(flush).toHaveBeenCalledOnce();
    expect(foreign).not.toHaveBeenCalled();
    unregister();
    unregister();
    expect(drafts.flush("shape-text-1")).toEqual({ accepted: true });
    expect(flush).toHaveBeenCalledOnce();
    expect(focus).not.toHaveBeenCalled();
  });

  test.each(["false", "throw"] as const)(
    "%s stops later fields and focuses the still-current rejected field",
    (failure) => {
      const drafts = createShapeTextFieldDrafts(),
        focus = vi.fn(),
        later = vi.fn(() => true);
      drafts.register({
        owner: "shape-text-1",
        current: () => true,
        focus,
        flush: () => {
          if (failure === "throw") throw Error("Invalid numeric draft");
          return false;
        },
      });
      drafts.register({ owner: "shape-text-1", current: () => true, flush: later, focus: vi.fn() });
      expect(drafts.flush("shape-text-1")).toEqual({ accepted: false });
      expect(focus).toHaveBeenCalledOnce();
      expect(later).not.toHaveBeenCalled();
    },
  );

  test("reentrant flush rejects atomically and a subsequent non-reentrant retry is allowed", () => {
    const drafts = createShapeTextFieldDrafts(),
      focus = vi.fn();
    let reenter = true;
    const flush = vi.fn(() => (reenter ? drafts.flush("shape-text-1").accepted : true));
    drafts.register({ owner: "shape-text-1", current: () => true, flush, focus });
    expect(drafts.flush("shape-text-1")).toEqual({ accepted: false });
    expect(flush).toHaveBeenCalledOnce();
    expect(focus).toHaveBeenCalledOnce();
    reenter = false;
    expect(drafts.flush("shape-text-1")).toEqual({ accepted: true });
    expect(flush).toHaveBeenCalledTimes(2);
  });

  test("a stale token never flushes or focuses a replacement owner", () => {
    const drafts = createShapeTextFieldDrafts(),
      flush = vi.fn(() => true),
      focus = vi.fn();
    drafts.register({ owner: "shape-text-1", current: () => false, flush, focus });
    expect(drafts.flush("shape-text-1")).toEqual({ accepted: false });
    expect(flush).not.toHaveBeenCalled();
    expect(focus).not.toHaveBeenCalled();
  });

  test("token replacement during a flush cannot report acceptance or focus the retired field", () => {
    const drafts = createShapeTextFieldDrafts(),
      focus = vi.fn();
    let current = true;
    drafts.register({
      owner: "shape-text-1",
      current: () => current,
      focus,
      flush: () => {
        current = false;
        return true;
      },
    });
    expect(drafts.flush("shape-text-1")).toEqual({ accepted: false });
    expect(focus).not.toHaveBeenCalled();
  });

  test("rejected-field focus is limited to the same live blocking owner and clears after acceptance", () => {
    const drafts = createShapeTextFieldDrafts(),
      focus = vi.fn();
    let blocking = true,
      accepted = false,
      current = true;
    drafts.register({
      owner: "shape-text-1",
      current: () => current,
      flush: () => accepted,
      focus,
      blocking: () => blocking,
    });
    expect(drafts.flush("shape-text-1").accepted).toBe(false);
    focus.mockClear();
    expect(drafts.focusRejected("shape-text-2")).toBe(false);
    expect(drafts.focusRejected("shape-text-1")).toBe(true);
    expect(focus).toHaveBeenCalledOnce();
    blocking = false;
    expect(drafts.focusRejected("shape-text-1")).toBe(false);
    blocking = true;
    current = false;
    expect(drafts.focusRejected("shape-text-1")).toBe(false);
    current = true;
    accepted = true;
    expect(drafts.flush("shape-text-1").accepted).toBe(true);
    expect(drafts.focusRejected("shape-text-1")).toBe(false);
  });

  test("unregistering a rejected field prevents later focus restoration", () => {
    const drafts = createShapeTextFieldDrafts(),
      focus = vi.fn();
    const unregister = drafts.register({
      owner: "shape-text-1",
      current: () => true,
      flush: () => false,
      focus,
    });
    expect(drafts.flush("shape-text-1").accepted).toBe(false);
    focus.mockClear();
    unregister();
    expect(drafts.focusRejected("shape-text-1")).toBe(false);
    expect(focus).not.toHaveBeenCalled();
  });

  test("field hook retires registrations synchronously on owner replacement and unmount", () => {
    const drafts = createShapeTextFieldDrafts(),
      owner = ref<string | undefined>("shape-text-1"),
      flush = vi.fn(() => true);
    const wrapper = mount(
      defineComponent({
        setup() {
          useShapeTextFieldDraft({ owner: () => owner.value, flush, focus: vi.fn() });
          return () => h("input");
        },
      }),
      { global: { provide: { [shapeTextFieldDraftsKey as symbol]: drafts } } },
    );
    try {
      expect(drafts.flush("shape-text-1")).toEqual({ accepted: true });
      expect(flush).toHaveBeenCalledOnce();
      owner.value = "shape-text-2";
      expect(drafts.flush("shape-text-1")).toEqual({ accepted: true });
      expect(flush).toHaveBeenCalledOnce();
      expect(drafts.flush("shape-text-2")).toEqual({ accepted: true });
      expect(flush).toHaveBeenCalledTimes(2);
      owner.value = undefined;
      expect(drafts.flush("shape-text-2")).toEqual({ accepted: true });
      expect(flush).toHaveBeenCalledTimes(2);
      owner.value = "shape-text-3";
      wrapper.unmount();
      expect(drafts.flush("shape-text-3")).toEqual({ accepted: true });
      expect(flush).toHaveBeenCalledTimes(2);
    } finally {
      wrapper.unmount();
    }
  });
});

test("owns current selected owner targets only, including a body popup and synchronous retirement", () => {
  const drafts = createShapeTextFieldDrafts(),
    input = document.createElement("input"),
    popup = document.createElement("div");
  document.body.append(input, popup);
  let current = true;
  const unregister = drafts.register({
    owner: "shape-owner-7",
    current: () => current,
    flush: () => true,
    focus: vi.fn(),
    containsTarget: (target) => target === input || target === popup,
  });
  expect(drafts.ownsTarget("shape-owner-7", input)).toBe(true);
  expect(drafts.ownsTarget("shape-owner-7", popup)).toBe(true);
  expect(drafts.ownsTarget("shape-owner-8", input)).toBe(false);
  expect(drafts.ownsTarget("shape-text-7", popup)).toBe(false);
  expect(drafts.ownsTarget("shape-owner-7", document.body)).toBe(false);
  current = false;
  expect(drafts.ownsTarget("shape-owner-7", input)).toBe(false);
  current = true;
  unregister();
  expect(drafts.ownsTarget("shape-owner-7", popup)).toBe(false);
  drafts.register({
    owner: "shape-owner-7",
    current: () => current,
    flush: () => true,
    focus: vi.fn(),
    containsTarget: () => {
      current = false;
      return true;
    },
  });
  expect(drafts.ownsTarget("shape-owner-7", input)).toBe(false);
  input.remove();
  popup.remove();
});
