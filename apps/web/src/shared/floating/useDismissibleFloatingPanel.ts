import { nextTick, onBeforeUnmount, onMounted, watch, type Ref } from "vue";
import {
  useFloatingPanel,
  type FloatingPanelOptions,
  type FloatingReference,
} from "./useFloatingPanel";

export type FloatingDismissReason = "escape" | "outside-pointer" | "outside-focus" | "programmatic";

export type DismissibleFloatingPanelOptions = FloatingPanelOptions & {
  additionalInside?: () => Iterable<HTMLElement | null | undefined>;
  onDismiss: (payload: { reason: FloatingDismissReason; restoreFocus: boolean }) => void;
};

// Teleported children are siblings in the DOM. Track opening order so one Escape
// closes only the most recently opened panel, regardless of listener mount order.
const openPanels: symbol[] = [];

export function useDismissibleFloatingPanel(
  reference: Readonly<Ref<FloatingReference | null>>,
  floating: Readonly<Ref<HTMLElement | null>>,
  open: Readonly<Ref<boolean>>,
  options: DismissibleFloatingPanelOptions,
) {
  const { additionalInside, onDismiss, ...floatingOptions } = options;
  const floatingPanel = useFloatingPanel(reference, floating, open, floatingOptions);
  let focusDismissArmed = false;
  const panelId = Symbol("floating-panel");

  function removeFromOpenPanels(): void {
    const index = openPanels.indexOf(panelId);
    if (index >= 0) openPanels.splice(index, 1);
  }

  function containsTarget(target: EventTarget | null): boolean {
    if (!(target instanceof Node)) {
      return false;
    }
    if (reference.value instanceof Element && reference.value.contains(target)) {
      return true;
    }
    if (floating.value?.contains(target)) {
      return true;
    }
    return Array.from(additionalInside?.() ?? []).some((element) => element?.contains(target));
  }

  function dismiss(reason: FloatingDismissReason, restoreFocus: boolean): void {
    if (!open.value) {
      return;
    }
    const focusTarget = reference.value;
    onDismiss({ reason, restoreFocus });
    if (restoreFocus && (focusTarget instanceof HTMLElement || focusTarget instanceof SVGElement)) {
      void nextTick(() => {
        // Do not steal focus from a menu reopened before this dismissal flushes.
        if (!open.value && focusTarget.isConnected) focusTarget.focus();
      });
    }
  }

  function onDocumentPointerDown(event: PointerEvent): void {
    if (open.value && !containsTarget(event.target)) {
      dismiss("outside-pointer", false);
    }
  }

  function onDocumentFocusIn(event: FocusEvent): void {
    if (!open.value) {
      return;
    }
    if (containsTarget(event.target)) {
      focusDismissArmed = true;
      return;
    }
    if (focusDismissArmed && floating.value) {
      dismiss("outside-focus", false);
    }
  }

  function onDocumentKeydown(event: KeyboardEvent): void {
    if (
      open.value &&
      event.key === "Escape" &&
      !event.defaultPrevented &&
      openPanels.at(-1) === panelId
    ) {
      event.preventDefault();
      dismiss("escape", true);
    }
  }

  watch(
    open,
    (isOpen) => {
      removeFromOpenPanels();
      if (isOpen) openPanels.push(panelId);
      else focusDismissArmed = false;
    },
    { immediate: true, flush: "sync" },
  );

  onMounted(() => {
    document.addEventListener("pointerdown", onDocumentPointerDown);
    document.addEventListener("focusin", onDocumentFocusIn);
    document.addEventListener("keydown", onDocumentKeydown);
  });

  onBeforeUnmount(() => {
    removeFromOpenPanels();
    document.removeEventListener("pointerdown", onDocumentPointerDown);
    document.removeEventListener("focusin", onDocumentFocusIn);
    document.removeEventListener("keydown", onDocumentKeydown);
  });

  return { ...floatingPanel, containsTarget, dismiss };
}
