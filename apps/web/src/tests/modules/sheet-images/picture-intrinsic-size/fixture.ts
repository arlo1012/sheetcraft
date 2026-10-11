import { afterEach, beforeEach, vi } from "vitest";
import { effectScope, shallowRef, type EffectScope } from "vue";
import {
  usePictureIntrinsicSize,
  type PictureIntrinsicSource,
} from "../../../../modules/sheet-images/usePictureIntrinsicSize";

export class MockImage {
  static instances: MockImage[] = [];
  static throwOnSource = false;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 0;
  naturalHeight = 0;
  // Displayed/declared sizes are not intrinsic dimensions.
  width = 9999;
  height = 7777;
  private source = "";
  readonly assignedSources: string[] = [];
  readonly removeAttribute = vi.fn((name: string) => {
    if (name === "src") this.source = "";
  });
  constructor() {
    MockImage.instances.push(this);
  }
  get src(): string {
    return this.source;
  }
  set src(value: string) {
    this.assignedSources.push(value);
    if (MockImage.throwOnSource) throw new Error("Synthetic source assignment failure.");
    this.source = value;
  }
  succeed(width: number, height: number): void {
    this.naturalWidth = width;
    this.naturalHeight = height;
    this.onload?.();
  }
  fail(): void {
    this.onerror?.();
  }
}

const scopes = new Set<EffectScope>();
beforeEach(() => {
  MockImage.instances = [];
  MockImage.throwOnSource = false;
  vi.stubGlobal("Image", MockImage);
});
afterEach(() => {
  for (const scope of scopes) scope.stop();
  scopes.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

export function fixture(initial: PictureIntrinsicSource | null = source("first")) {
  const owner = shallowRef<unknown>({ id: "owner" });
  const selected = shallowRef<PictureIntrinsicSource | undefined>(initial ?? undefined);
  const scope = effectScope();
  scopes.add(scope);
  const value = scope.run(() =>
    usePictureIntrinsicSize({ getOwner: () => owner.value, getSource: () => selected.value }),
  )!;
  return { owner, selected, scope, value };
}

export function source(id: string, url = `blob:${id}`): PictureIntrinsicSource {
  return { assetId: id, url };
}

export function image(index = MockImage.instances.length - 1): MockImage {
  const result = MockImage.instances[index];
  if (!result) throw new Error("Expected an intrinsic dimension loader.");
  return result;
}
