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

export function useDismissibleFloatingPanel(
  reference: Readonly<Ref<FloatingReference | null>>,
  floating: Readonly<Ref<HTMLElement | null>>,
  open: Readonly<Ref<boolean>>,
  options: DismissibleFloatingPanelOptions,
) {
  const { additionalInside, onDismiss, ...floatingOptions } = options;
  const floatingPanel = useFloatingPanel(reference, floating, open, floatingOptions);
  let focusDismissArmed = false;

  function containsTarget(target: EventTarget | null): boolean {
    if (!(target instanceof Node)) {
      return false;
    }
    if (reference.value instanceof HTMLElement && reference.value.contains(target)) {
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
    onDismiss({ reason, restoreFocus });
    if (restoreFocus && reference.value instanceof HTMLElement) {
      void nextTick(() => reference.value instanceof HTMLElement && reference.value.focus());
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
    if (open.value && event.key === "Escape") {
      event.preventDefault();
      dismiss("escape", true);
    }
  }

  watch(open, (isOpen) => {
    if (!isOpen) {
      focusDismissArmed = false;
    }
  });

  onMounted(() => {
    document.addEventListener("pointerdown", onDocumentPointerDown);
    document.addEventListener("focusin", onDocumentFocusIn);
    document.addEventListener("keydown", onDocumentKeydown);
  });

  onBeforeUnmount(() => {
    document.removeEventListener("pointerdown", onDocumentPointerDown);
    document.removeEventListener("focusin", onDocumentFocusIn);
    document.removeEventListener("keydown", onDocumentKeydown);
  });

  return { ...floatingPanel, containsTarget, dismiss };
}
