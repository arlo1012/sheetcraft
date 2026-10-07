import { computed, onBeforeUnmount, onMounted, ref, type Ref } from "vue";

const MINIMUM_TABS_WIDTH = 200;
const MINIMUM_SCROLLBAR_WIDTH = 100;
const MINIMUM_REGION_RATIO = 0.2;
const SEPARATOR_WIDTH = 8;

type ResizeGesture = {
  pointerId: number;
  target: HTMLElement;
  startX: number;
  startWidth: number;
  preferredWidth: number | undefined;
};

export function useSheetTabsWidth(container: Ref<HTMLElement | null>, contentWidth: Ref<number>) {
  const containerWidth = ref(typeof window === "undefined" ? 1280 : window.innerWidth);
  const preferredWidth = ref<number>();
  const resizing = ref(false);
  const maximum = computed(() =>
    Math.max(
      0,
      Math.floor(
        containerWidth.value -
          SEPARATOR_WIDTH -
          Math.max(MINIMUM_SCROLLBAR_WIDTH, containerWidth.value * MINIMUM_REGION_RATIO),
      ),
    ),
  );
  const minimum = computed(() =>
    Math.min(
      Math.max(MINIMUM_TABS_WIDTH, Math.ceil(containerWidth.value * MINIMUM_REGION_RATIO)),
      maximum.value,
    ),
  );
  const width = computed(() => clamp(preferredWidth.value ?? contentWidth.value));
  let gesture: ResizeGesture | undefined;
  let observer: ResizeObserver | undefined;

  function clamp(value: number): number {
    return Math.min(maximum.value, Math.max(minimum.value, Math.round(value)));
  }

  function measure(): void {
    const measuredWidth = container.value?.getBoundingClientRect().width;
    if (measuredWidth && measuredWidth > 0) containerWidth.value = measuredWidth;
  }

  function stop(): void {
    const previous = gesture;
    gesture = undefined;
    resizing.value = false;
    if (previous?.target.hasPointerCapture?.(previous.pointerId)) {
      previous.target.releasePointerCapture(previous.pointerId);
    }
  }

  function cancel(): void {
    if (gesture) preferredWidth.value = gesture.preferredWidth;
    stop();
  }

  function onPointerDown(event: PointerEvent): void {
    if (event.button !== 0 || gesture || maximum.value <= minimum.value) return;
    const target = event.currentTarget as HTMLElement;
    measure();
    event.preventDefault();
    target.focus({ preventScroll: true });
    gesture = {
      pointerId: event.pointerId,
      target,
      startX: event.clientX,
      startWidth: width.value,
      preferredWidth: preferredWidth.value,
    };
    resizing.value = true;
    target.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event: PointerEvent): void {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    event.preventDefault();
    preferredWidth.value = clamp(gesture.startWidth + event.clientX - gesture.startX);
  }

  function onPointerUp(event: PointerEvent): void {
    if (event.pointerId === gesture?.pointerId) stop();
  }

  function onPointerCancel(event: PointerEvent): void {
    if (event.pointerId === gesture?.pointerId) cancel();
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape" && gesture) {
      event.preventDefault();
      event.stopPropagation();
      cancel();
      return;
    }
    if (gesture || event.ctrlKey || event.metaKey || event.altKey) return;
    let nextWidth: number;
    switch (event.key) {
      case "ArrowLeft":
        nextWidth = width.value - 16;
        break;
      case "ArrowRight":
        nextWidth = width.value + 16;
        break;
      case "Home":
        nextWidth = minimum.value;
        break;
      case "End":
        nextWidth = maximum.value;
        break;
      default:
        return;
    }
    event.preventDefault();
    preferredWidth.value = clamp(nextWidth);
  }

  onMounted(() => {
    measure();
    if (typeof ResizeObserver !== "undefined" && container.value) {
      observer = new ResizeObserver((entries) => {
        const measuredWidth = entries.find((entry) => entry.target === container.value)?.contentRect
          .width;
        if (measuredWidth && measuredWidth > 0) containerWidth.value = measuredWidth;
      });
      observer.observe(container.value);
    } else {
      window.addEventListener("resize", measure);
    }
    window.addEventListener("blur", stop);
  });

  onBeforeUnmount(() => {
    stop();
    observer?.disconnect();
    window.removeEventListener("resize", measure);
    window.removeEventListener("blur", stop);
  });

  return {
    width,
    minimum,
    maximum,
    resizing,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onKeydown,
  };
}
