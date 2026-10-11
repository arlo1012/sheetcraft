import { computed, getCurrentScope, onScopeDispose, readonly, shallowRef, watch } from "vue";
import { assertImagePixelBudget } from "../image-assets/imageAssetValidation";

export type PictureIntrinsicSource = { readonly assetId: string; readonly url: string };
export type PictureIntrinsicSize = PictureIntrinsicSource & {
  readonly width: number;
  readonly height: number;
};
export type PictureIntrinsicSizeStatus = "idle" | "loading" | "ready" | "unavailable";
export interface PictureIntrinsicSizeOptions {
  /** Reactive getter for a stable selected-owner identity or generation token. */
  getOwner: () => unknown;
  /**
   * Only return the selected leaf's current entry from useImageAssetUrls.urls.
   * That adapter must have preflighted the encoded source before creating its URL.
   * An absent source (including a closed pane) clears the displayed dimensions.
   */
  getSource: () => PictureIntrinsicSource | undefined;
}

type State = { status: PictureIntrinsicSizeStatus; size: PictureIntrinsicSize | undefined };
type Loader = {
  image: HTMLImageElement;
  owner: unknown;
  source: PictureIntrinsicSource;
  generation: number;
};

function sameSource(left: PictureIntrinsicSource | undefined, right: PictureIntrinsicSource) {
  return left?.assetId === right.assetId && left.url === right.url;
}

/** Decode just the selected, preflighted blob; the supplying adapter owns its URL lifetime. */
export function usePictureIntrinsicSize(options: PictureIntrinsicSizeOptions) {
  const state = shallowRef<State>({ status: "idle", size: undefined });
  const publicState = readonly(state);
  // One successful asset/URL pair is sufficient for closing and reopening the pane.
  let cached: PictureIntrinsicSize | undefined;
  let loader: Loader | undefined;
  let generation = 0;
  let disposed = false;

  function stopLoader(): void {
    const previous = loader;
    loader = undefined;
    if (!previous) return;
    previous.image.onload = null;
    previous.image.onerror = null;
    // Removing src cancels this consumer without navigating to an empty URL or revoking it.
    previous.image.removeAttribute("src");
  }

  function current(candidate: Loader): boolean {
    return (
      !disposed &&
      loader === candidate &&
      generation === candidate.generation &&
      options.getOwner() === candidate.owner &&
      sameSource(options.getSource(), candidate.source)
    );
  }

  function load(owner: unknown, source: PictureIntrinsicSource | undefined): void {
    const requestedGeneration = ++generation;
    stopLoader();
    if (disposed || !source) {
      state.value = { status: "idle", size: undefined };
      return;
    }
    // Provenance comes from getSource's adapter contract; never decode another URL scheme.
    if (
      typeof source.assetId !== "string" ||
      !source.assetId.trim() ||
      typeof source.url !== "string" ||
      !source.url.startsWith("blob:") ||
      source.url.length === 5 ||
      /\s/.test(source.url)
    ) {
      state.value = { status: "unavailable", size: undefined };
      return;
    }
    if (sameSource(cached, source)) {
      state.value = { status: "ready", size: cached };
      return;
    }
    state.value = { status: "loading", size: undefined };
    if (disposed || requestedGeneration !== generation) return;
    let candidate: Loader | undefined;
    try {
      const image = new Image();
      if (disposed || requestedGeneration !== generation) return;
      candidate = {
        image,
        owner,
        source: { assetId: source.assetId, url: source.url },
        generation: requestedGeneration,
      };
      loader = candidate;
      const pending = candidate;
      pending.image.onload = () => {
        if (!current(pending)) return;
        let dimensions: { width: number; height: number };
        try {
          dimensions = assertImagePixelBudget(
            pending.image.naturalWidth,
            pending.image.naturalHeight,
          );
        } catch {
          stopLoader();
          state.value = { status: "unavailable", size: undefined };
          return;
        }
        stopLoader();
        cached = { ...pending.source, ...dimensions };
        state.value = { status: "ready", size: cached };
      };
      pending.image.onerror = () => {
        if (!current(pending)) return;
        stopLoader();
        state.value = { status: "unavailable", size: undefined };
      };
      pending.image.src = pending.source.url;
    } catch {
      if (disposed || requestedGeneration !== generation) return;
      if (candidate && !current(candidate)) return;
      stopLoader();
      state.value = { status: "unavailable", size: undefined };
    }
  }

  const stopWatching = watch(
    () => {
      const owner = options.getOwner();
      const source = options.getSource();
      return [owner, source?.assetId, source?.url] as const;
    },
    (next, previous) => {
      if (previous && next.every((value, index) => value === previous[index])) return;
      const [owner, assetId, url] = next;
      load(owner, assetId === undefined || url === undefined ? undefined : { assetId, url });
    },
    { immediate: true, flush: "sync" },
  );
  if (getCurrentScope())
    onScopeDispose(() => {
      disposed = true;
      generation += 1;
      stopWatching();
      stopLoader();
      cached = undefined;
      state.value = { status: "idle", size: undefined };
    });

  function retry(): void {
    if (disposed || state.value.status === "loading") return;
    load(options.getOwner(), options.getSource());
  }

  return {
    size: computed(() => publicState.value.size),
    status: computed(() => publicState.value.status),
    retry,
  };
}
