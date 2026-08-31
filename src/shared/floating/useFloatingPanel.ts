import {
  autoUpdate,
  flip,
  offset,
  shift,
  type MaybeReadonlyRefOrGetter,
  useFloating,
  type Placement,
  type VirtualElement,
} from "@floating-ui/vue";
import type { Ref } from "vue";

export type FloatingReference = HTMLElement | VirtualElement;

export type FloatingPanelOptions = {
  placement?: MaybeReadonlyRefOrGetter<Placement>;
  offset?: number;
  padding?: number;
};

export function useFloatingPanel(
  reference: Readonly<Ref<FloatingReference | null>>,
  floating: Readonly<Ref<HTMLElement | null>>,
  open: Readonly<Ref<boolean>>,
  options: FloatingPanelOptions = {},
) {
  const padding = options.padding ?? 8;

  return useFloating(reference, floating, {
    open,
    placement: options.placement ?? "bottom-start",
    strategy: "fixed",
    middleware: [offset(options.offset ?? 6), flip({ padding }), shift({ padding })],
    whileElementsMounted: autoUpdate,
  });
}
