import type { ObjectDirective } from "vue";

type SliderSemantics = {
  label: string;
  value?: number;
  min?: number;
  max?: number;
  unit?: string;
};
type OwnedAttribute = { previous: string | null; applied: string | null };
type SliderState = { element: HTMLElement; attributes: Map<string, OwnedAttribute> };
const states = new WeakMap<HTMLElement, SliderState>();

function release(root: HTMLElement) {
  const state = states.get(root);
  if (!state) return;
  for (const [name, { previous, applied }] of state.attributes) {
    // Do not undo a newer library/consumer update to the same attribute.
    if (state.element.getAttribute(name) !== applied) continue;
    if (previous === null) state.element.removeAttribute(name);
    else state.element.setAttribute(name, previous);
  }
  states.delete(root);
}
function update(root: HTMLElement, value: SliderSemantics) {
  const sliders = root.querySelectorAll<HTMLElement>('[role="slider"]');
  // This adapter supports one existing slider only, never range/multi-thumb controls.
  const element = sliders.length === 1 ? sliders[0] : undefined;
  if (states.get(root)?.element !== element) release(root);
  if (!element) return;
  let state = states.get(root);
  if (!state) {
    state = { element, attributes: new Map() };
    states.set(root, state);
  }
  const finite = (number: number | undefined): number is number =>
    typeof number === "number" && Number.isFinite(number);
  const available =
    finite(value.value) &&
    finite(value.min) &&
    finite(value.max) &&
    value.min <= value.max &&
    value.value >= value.min &&
    value.value <= value.max;
  const attributes: Record<string, string | null> = {
    "aria-label": value.label,
    "aria-valuenow": available ? String(value.value) : null,
    "aria-valuetext": available
      ? [String(value.value), value.unit].filter(Boolean).join(" ")
      : null,
  };
  for (const [name, applied] of Object.entries(attributes)) {
    const owned = state.attributes.get(name);
    state.attributes.set(name, {
      previous: owned ? owned.previous : element.getAttribute(name),
      applied,
    });
    if (applied === null) element.removeAttribute(name);
    else element.setAttribute(name, applied);
  }
}

// TDesign 1.20 places fallthrough ARIA on its wrapper, not its inner slider role.
// Keep the library DOM adaptation here until its public API exposes role attrs.
export const vSliderSemantics: ObjectDirective<HTMLElement, SliderSemantics> = {
  mounted(root, { value }) {
    update(root, value);
  },
  updated(root, { value }) {
    update(root, value);
  },
  unmounted: release,
};
