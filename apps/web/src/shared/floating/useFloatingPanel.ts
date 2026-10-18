import {
  autoUpdate,
  flip,
  offset,
  shift,
  type MaybeReadonlyRefOrGetter,
  useFloating,
  type Placement,
  type VirtualElement,
  type Middleware,
} from "@floating-ui/vue";
import type { Ref } from "vue";

export type FloatingReference = HTMLElement | SVGElement | VirtualElement;

export type FloatingPanelOptions = {
  placement?: MaybeReadonlyRefOrGetter<Placement>;
  offset?: number;
  padding?: number;
  avoidCollisions?: boolean;
  /** Keep automatic placement outside the reference; caller owns no-space fallback. */
  avoidReferenceOverlap?: boolean;
};

// Evaluated inside computePosition's platform context on every autoUpdate, so
// clipping ancestors are current even when x/y or intersection ratio is unchanged.
const referenceClip: Middleware = {
  name: "referenceClip",
  async fn(state) {
    const reference = state.elements.reference;
    const element = reference instanceof Element ? reference : reference.contextElement;
    if (!element) return {};
    return {
      data: await state.platform.getClippingRect({
        element,
        boundary: "clippingAncestors",
        rootBoundary: "viewport",
        strategy: state.strategy,
      }),
    };
  },
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
    middleware: [
      offset(options.offset ?? 6),
      ...(options.avoidReferenceOverlap ? [referenceClip] : []),
      ...(options.avoidCollisions === false
        ? []
        : [
            flip({
              padding,
              ...(options.avoidReferenceOverlap
                ? { fallbackAxisSideDirection: "end" as const }
                : {}),
            }),
            shift({ padding, crossAxis: !options.avoidReferenceOverlap }),
          ]),
    ],
    whileElementsMounted: autoUpdate,
  });
}
