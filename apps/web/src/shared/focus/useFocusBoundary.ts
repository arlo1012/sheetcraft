import { nextTick, onBeforeUnmount, onMounted } from "vue";

/** One logical focus boundary may span a toolbar and explicitly owned teleports. */
export function useFocusBoundary(options: {
  owns: (target: EventTarget | null) => boolean;
  onLeave: () => void;
}) {
  let mounted = false;
  let sequence = 0;
  const onFocusOut = (event: FocusEvent) => {
    if (!options.owns(event.target) || options.owns(event.relatedTarget)) return;
    const request = ++sequence;
    void nextTick(() => {
      if (mounted && request === sequence && !options.owns(document.activeElement))
        options.onLeave();
    });
  };
  onMounted(() => {
    mounted = true;
    document.addEventListener("focusout", onFocusOut, true);
  });
  onBeforeUnmount(() => {
    mounted = false;
    sequence++;
    document.removeEventListener("focusout", onFocusOut, true);
  });
}
