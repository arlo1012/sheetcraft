import {
  computed,
  inject,
  nextTick,
  onBeforeUnmount,
  provide,
  ref,
  watch,
  type InjectionKey,
} from "vue";

type PopupRegistration = {
  elements: () => HTMLElement[];
  invalidate: () => void;
};
export type NativePopupScope = {
  generation: Readonly<{ value: number }>;
  current: () => boolean;
  register: (popup: PopupRegistration) => () => void;
  popupElements: () => HTMLElement[];
  containsTarget: (target: EventTarget | null) => boolean;
};
const nativePopupScopeKey: InjectionKey<NativePopupScope> = Symbol("native-popup-scope");

/** Collect only explicitly registered, live native popups for one floating owner. */
export function provideNativePopupScope(options: {
  owner: () => string | undefined;
  active?: () => boolean;
}) {
  const popups = new Set<PopupRegistration>();
  const generation = ref(0);
  let mounted = true;
  const current = () => mounted && !!options.owner() && options.active?.() !== false;
  const popupElements = () => (current() ? [...popups].flatMap((popup) => popup.elements()) : []);
  const scope: NativePopupScope = {
    generation,
    current,
    register(popup) {
      popups.add(popup);
      return () => popups.delete(popup);
    },
    popupElements,
    containsTarget(target) {
      return (
        target instanceof Node &&
        target.isConnected &&
        popupElements().some((host) => host.contains(target))
      );
    },
  };
  function invalidate() {
    generation.value++;
    for (const popup of popups) popup.invalidate();
  }
  watch(() => [options.owner(), options.active?.() !== false] as const, invalidate, {
    flush: "sync",
  });
  onBeforeUnmount(() => {
    mounted = false;
    invalidate();
    popups.clear();
  });
  provide(nativePopupScopeKey, scope);
  return scope;
}

/** Public native popupProps stay on the library control; this owns its exact body host. */
export function useNativePopupOwnership(options: {
  owner: () => string | undefined;
  disabled: () => boolean;
  root: () => HTMLElement | null | undefined;
  /** Same-setup owners pass their own provided scope explicitly. */
  scope?: NativePopupScope;
  /** Focus identity is separate from the stricter command owner/epoch. */
  focus?: {
    owner: () => string | undefined;
    input: () => HTMLInputElement | null | undefined;
    /** Additional instance-local draft boundaries, e.g. a standalone dialog handler. */
    cancelOnChange?: () => unknown;
  };
}) {
  const scope = options.scope ?? inject(nativePopupScopeKey, undefined);
  const host = ref<HTMLElement>();
  const visible = ref(false);
  const generation = ref(0);
  let mounted = true;
  let cancelFocus: (() => void) | undefined;
  let opened:
    | { owner: string; generation: number; scopeGeneration: number | undefined }
    | undefined;
  function invalidate() {
    opened = undefined;
    visible.value = false;
    generation.value++;
  }
  const available = () =>
    mounted && !!options.owner() && !options.disabled() && scope?.current() !== false;
  function popupElements(): HTMLElement[] {
    const current = opened;
    return available() &&
      visible.value &&
      !!current &&
      current.owner === options.owner() &&
      current.generation === generation.value &&
      current.scopeGeneration === scope?.generation.value &&
      options.root()?.isConnected &&
      host.value?.isConnected
      ? [host.value]
      : [];
  }
  function containsTarget(target: EventTarget | null): boolean {
    return (
      target instanceof Node &&
      target.isConnected &&
      popupElements().some((element) => element.contains(target))
    );
  }
  // This never grants permission to apply. The caller supplies its original
  // captured command action; only its explicit true result can request focus.
  function acceptChoice(apply: () => boolean): boolean {
    cancelFocus?.();
    const focus = options.focus,
      owner = focus?.owner(),
      originalInput = focus?.input();
    const focused = document.activeElement;
    const eligible =
      !!focus &&
      !!owner &&
      available() &&
      visible.value &&
      popupElements().length > 0 &&
      !!originalInput?.readOnly &&
      (focused === originalInput ||
        focused === document.body ||
        !!(focused && host.value?.contains(focused)));
    let moved = false;
    const release = () => {
      document.removeEventListener("focusin", focusMoved);
      document.removeEventListener("pointerdown", cancel);
      if (cancelFocus === cancel) cancelFocus = undefined;
    };
    const cancel = () => {
      moved = true;
      release();
    };
    const focusMoved = (event: FocusEvent) => {
      if (
        event.target !== originalInput &&
        event.target !== focus?.input() &&
        event.target !== document.body &&
        !(event.target instanceof Node && host.value?.contains(event.target))
      )
        cancel();
    };
    if (eligible) {
      cancelFocus = cancel;
      document.addEventListener("focusin", focusMoved);
      document.addEventListener("pointerdown", cancel);
    }
    let accepted = false;
    try {
      accepted = apply() === true;
    } finally {
      if (!accepted || !eligible) release();
    }
    if (accepted && eligible && focus)
      void nextTick(() => {
        try {
          const input = focus.input(),
            active = document.activeElement;
          if (
            !mounted ||
            moved ||
            owner !== focus.owner() ||
            !available() ||
            visible.value ||
            !options.root()?.isConnected ||
            !input?.isConnected ||
            !input.readOnly ||
            input.disabled ||
            (active !== originalInput &&
              active !== input &&
              active !== document.body &&
              active !== null &&
              !host.value?.contains(active))
          )
            return;
          input.focus({ preventScroll: true });
        } finally {
          release();
        }
      });
    return accepted;
  }
  if (options.focus) {
    watch([options.focus.owner, options.disabled], () => cancelFocus?.(), { flush: "sync" });
    if (options.focus.cancelOnChange)
      watch(options.focus.cancelOnChange, () => cancelFocus?.(), { flush: "sync" });
  }
  const onVisibleChange = computed(() => {
    const owner = options.owner(),
      captured = generation.value,
      scopeGeneration = scope?.generation.value;
    return (next: boolean) => {
      if (
        !mounted ||
        owner !== options.owner() ||
        captured !== generation.value ||
        scopeGeneration !== scope?.generation.value
      )
        return false;
      if (next && available() && owner) {
        opened = { owner, generation: captured, scopeGeneration };
        visible.value = true;
      } else invalidate();
      return true;
    };
  });
  watch(() => [options.owner(), options.disabled(), scope?.generation.value] as const, invalidate, {
    flush: "sync",
  });
  const unregister = scope?.register({ elements: popupElements, invalidate });
  onBeforeUnmount(() => {
    mounted = false;
    cancelFocus?.();
    invalidate();
    unregister?.();
  });
  return {
    host,
    visible,
    generation,
    popupProps: { attach: () => host.value! },
    onVisibleChange,
    acceptChoice,
    containsTarget,
    popupElements,
  };
}
