import type { ObjectDirective } from "vue";

type NativeControl = HTMLInputElement | HTMLTextAreaElement;
type NativeControlBinding = {
  attributes: Record<string, string | number | boolean | null | undefined>;
  onElement?: (element: NativeControl | null) => void;
  /** InputNumber has no public step-button props. Native access stays at the adapter boundary. */
  numberSteps?: Record<"decrease" | "increase", { label: string; disabled: boolean }>;
};

// TDesign Input/Textarea apply extra attributes to their wrapper. Keep native
// editor semantics and DOM access at the adapter boundary until they expose it.
export const vNativeControl: ObjectDirective<HTMLElement, NativeControlBinding> = {
  mounted(root, { value }) {
    const input = root.querySelector<NativeControl>("input, textarea");
    if (!input) return;
    applyAttributes(input, value.attributes);
    applyNumberSteps(root, value.numberSteps);
    value.onElement?.(input);
  },
  updated(root, { value, oldValue }) {
    const input = root.querySelector<NativeControl>("input, textarea");
    if (!input) return;
    for (const key of Object.keys(oldValue?.attributes ?? {})) {
      if (!(key in value.attributes)) input.removeAttribute(key);
    }
    applyAttributes(input, value.attributes);
    applyNumberSteps(root, value.numberSteps);
    value.onElement?.(input);
  },
  unmounted(_root, { value }) {
    value.onElement?.(null);
  },
};

function applyAttributes(
  input: NativeControl,
  attributes: NativeControlBinding["attributes"],
): void {
  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined || value === null) input.removeAttribute(key);
    else input.setAttribute(key, String(value));
  }
}

function applyNumberSteps(root: HTMLElement, steps: NativeControlBinding["numberSteps"]): void {
  if (!steps) return;
  for (const direction of ["decrease", "increase"] as const) {
    const button = root.querySelector<HTMLButtonElement>(`.t-input-number__${direction}`);
    if (!button) continue;
    button.setAttribute("aria-label", steps[direction].label);
    button.setAttribute("aria-disabled", String(steps[direction].disabled));
    button.disabled = steps[direction].disabled;
  }
}
