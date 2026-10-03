import type { ObjectDirective } from "vue";

type IconActionState = { disabled: boolean; tabIndex: string; cleanup: () => void };
const states = new WeakMap<HTMLElement, IconActionState>();

/** Keyboard and disabled semantics for directly interactive icon containers. */
export const vIconAction: ObjectDirective<HTMLElement, boolean | undefined> = {
  mounted(element, { value }) {
    const state: IconActionState = {
      disabled: Boolean(value),
      tabIndex: element.getAttribute("tabindex") ?? "0",
      cleanup: () => {},
    };
    const guardDisabled = (event: Event) => {
      if (!state.disabled) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const guardDisabledKey = (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") guardDisabled(event);
    };
    const activate = (event: KeyboardEvent) => {
      if (event.target !== element || (event.key !== "Enter" && event.key !== " ")) return;
      if (state.disabled || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) element.click();
    };
    element.addEventListener("click", guardDisabled, true);
    element.addEventListener("pointerdown", guardDisabled, true);
    element.addEventListener("keydown", guardDisabledKey, true);
    element.addEventListener("keydown", activate);
    state.cleanup = () => {
      element.removeEventListener("click", guardDisabled, true);
      element.removeEventListener("pointerdown", guardDisabled, true);
      element.removeEventListener("keydown", guardDisabledKey, true);
      element.removeEventListener("keydown", activate);
    };
    states.set(element, state);
    element.setAttribute("role", element.getAttribute("role") ?? "button");
    sync(element, state);
  },
  updated(element, { value, oldValue }) {
    const state = states.get(element)!;
    if (!oldValue) state.tabIndex = element.getAttribute("tabindex") ?? "0";
    state.disabled = Boolean(value);
    sync(element, state);
  },
  beforeUnmount(element) {
    states.get(element)?.cleanup();
    states.delete(element);
  },
};

function sync(element: HTMLElement, state: IconActionState): void {
  element.classList.add("idea-icon-action");
  element.setAttribute("tabindex", state.disabled ? "-1" : state.tabIndex);
  element.setAttribute("aria-disabled", String(state.disabled));
}
