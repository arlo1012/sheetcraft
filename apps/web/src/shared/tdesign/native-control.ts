import type { ObjectDirective } from "vue";

type NativeControl = HTMLInputElement | HTMLTextAreaElement;
type NativeControlBinding = {
  attributes: Record<string, string | number | boolean | null | undefined>;
  onElement?: (element: NativeControl | null) => void;
};

// TDesign Input/Textarea apply extra attributes to their wrapper. Keep native
// editor semantics and DOM access at the adapter boundary until they expose it.
export const vNativeControl: ObjectDirective<HTMLElement, NativeControlBinding> = {
  mounted(root, { value }) {
    const input = root.querySelector<NativeControl>("input, textarea");
    if (!input) return;
    applyAttributes(input, value.attributes);
    value.onElement?.(input);
  },
  updated(root, { value, oldValue }) {
    const input = root.querySelector<NativeControl>("input, textarea");
    if (!input) return;
    for (const key of Object.keys(oldValue?.attributes ?? {})) {
      if (!(key in value.attributes)) input.removeAttribute(key);
    }
    applyAttributes(input, value.attributes);
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
