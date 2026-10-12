import { computed, onUnmounted, ref, watch } from "vue";
import type { PictureDetailedStyle } from "@sheetcraft/core/picture-detailed-style";
import type {
  PictureFormatCapability,
  PictureFormatTranslate,
} from "../../../sheet-images/picture-format-pane-model";
import type { PictureTextureId } from "../../../sheet-images/picture-texture";
import {
  createShapeFormatSession,
  shapeFormatOwnerKey,
  type ShapeFormatCapabilities,
  type ShapeFormatField,
  type ShapeFormatIntentHandler,
  type ShapeFormatMode,
  type ShapeFormatOptions,
  type ShapeFormatSnapshot,
  type ShapeFormatStyleCategory,
  type ShapeFormatFailure,
} from "../../shape-format-pane-model";
import {
  createShapeFormatTranslate,
  isShapeFormatLabelKey,
  type ShapeFormatTranslate,
} from "./shape-format-labels";
export interface ShapeFormatPaneInput {
  snapshot: ShapeFormatSnapshot | null;
  capabilities: ShapeFormatCapabilities;
  onIntent: ShapeFormatIntentHandler;
  t: PictureFormatTranslate;
  shapeT?: ShapeFormatTranslate;
  locale?: "en-US" | "zh-CN";
  options?: ShapeFormatOptions;
  loadPaintAsset?: (blob: Blob, texture?: PictureTextureId) => Promise<string | undefined>;
}
export function useShapeFormatPane(props: ShapeFormatPaneInput) {
  const failure = ref<ShapeFormatFailure>();
  const epoch = ref(0);
  const numericDrafts = ref(new Set<string>());
  const hasActiveNumericDraft = computed(() => numericDrafts.value.size > 0);
  function setNumericDraft(key: string, active: boolean) {
    if (active) numericDrafts.value.add(key);
    else numericDrafts.value.delete(key);
  }
  const accepted = new Set<string>();
  const session = createShapeFormatSession({
    snapshot: () => {
      // Rendered action bindings also depend on explicit cancellation/unit boundaries.
      void epoch.value;
      return props.snapshot;
    },
    capabilities: () => props.capabilities,
    handler: () => props.onIntent,
    feedback: (value) => {
      failure.value = value;
    },
    accepted: (id) => {
      accepted.add(id);
      if (accepted.size > 32) accepted.delete(accepted.values().next().value!);
    },
  });
  const s = computed(() => props.shapeT ?? createShapeFormatTranslate(props.locale ?? "en-US"));
  const ownerKey = computed(
    () => `${props.snapshot ? shapeFormatOwnerKey(props.snapshot.owner) : "none"}:${epoch.value}`,
  );
  const isGroup = computed(() => props.snapshot?.drawing.kind === "shapeGroup");
  function isMixedField(field: ShapeFormatField): boolean {
    return props.snapshot?.mixedFields?.includes(field) === true;
  }
  function isMixedStyle(target: ShapeFormatMode, category: ShapeFormatStyleCategory): boolean {
    return props.snapshot?.mixedStyleCategories?.[target]?.includes(category) === true;
  }
  watch(
    () =>
      [
        props.snapshot ? shapeFormatOwnerKey(props.snapshot.owner) : "",
        props.snapshot?.revision,
        props.onIntent,
      ] as const,
    (next, previous) => {
      const own =
        next[0] === previous[0] &&
        next[2] === previous[2] &&
        !!props.snapshot?.acceptedIntentId &&
        accepted.delete(props.snapshot.acceptedIntentId);
      if (!own) {
        session.cancel();
        epoch.value++;
        numericDrafts.value.clear();
      }
    },
    { flush: "sync" },
  );
  function cancel() {
    session.cancel();
    epoch.value++;
    accepted.clear();
    numericDrafts.value.clear();
  }
  onUnmounted(cancel);
  function fieldCapability(field: ShapeFormatField): PictureFormatCapability {
    const capability = props.capabilities.fields[field];
    if (!props.snapshot) return { enabled: false, reason: s.value("missingSelection") };
    if (props.snapshot.values[field] === undefined && !isMixedField(field))
      return { enabled: false, reason: capability?.reason ?? s.value("missingValue") };
    return capability ?? { enabled: false, reason: s.value("unsupported") };
  }
  function styleCapability(
    target: ShapeFormatMode,
    category: ShapeFormatStyleCategory,
  ): PictureFormatCapability {
    return props.snapshot
      ? (props.capabilities.styles?.[target]?.[category] ?? {
          enabled: false,
          reason: s.value("unsupported"),
        })
      : { enabled: false, reason: s.value("missingSelection") };
  }
  function style(target: ShapeFormatMode): Readonly<PictureDetailedStyle> | undefined {
    return target === "shape" ? props.snapshot?.shapeStyle : props.snapshot?.textStyle;
  }
  function styleBinding<K extends ShapeFormatStyleCategory>(target: ShapeFormatMode, category: K) {
    const capability = styleCapability(target, category);
    const base = props.t;
    const t: PictureFormatTranslate = (key) =>
      key === "paintBehindSourceHelp"
        ? s.value(target === "shape" ? "shapeFillHelp" : "textFillHelp")
        : base(key);
    return {
      ownerKey: `${ownerKey.value}:${target}:${category}`,
      value: isMixedStyle(target, category) ? undefined : style(target)?.[category],
      mixed: isMixedStyle(target, category),
      disabled: !capability.enabled,
      t,
      onCommit: session.styleAction(target, category),
    };
  }
  function assetLoader(target: ShapeFormatMode, category: "fill" | "line") {
    const token = session.capture(),
      loader = props.loadPaintAsset;
    if (!loader) return undefined;
    return async (blob: Blob, texture?: PictureTextureId) => {
      if (
        !session.current(token) ||
        !styleCapability(target, category).enabled ||
        props.loadPaintAsset !== loader
      )
        return undefined;
      const id = await loader(blob, texture);
      return session.current(token) &&
        styleCapability(target, category).enabled &&
        props.loadPaintAsset === loader
        ? id
        : undefined;
    };
  }
  function fieldLabel(field: ShapeFormatField): string {
    return isShapeFormatLabelKey(field)
      ? s.value(field)
      : props.t(field as Parameters<PictureFormatTranslate>[0]);
  }
  const error = computed(() =>
    failure.value
      ? s.value(
          failure.value === "missing-selection"
            ? "missingSelection"
            : failure.value === "stale-owner"
              ? "staleOwner"
              : failure.value === "out-of-range"
                ? "outOfRange"
                : failure.value === "unsupported"
                  ? "unsupported"
                  : "applyRejected",
        )
      : undefined,
  );
  return {
    props,
    s,
    ownerKey,
    isGroup,
    isMixedField,
    isMixedStyle,
    error,
    session,
    cancel,
    hasActiveNumericDraft,
    setNumericDraft,
    fieldCapability,
    fieldLabel,
    styleCapability,
    styleBinding,
    assetLoader,
  };
}
export type ShapeFormatController = ReturnType<typeof useShapeFormatPane>;
