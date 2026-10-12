import type { PictureTextureId } from "../../picture-texture";
import { computed, onUnmounted, ref, useId, watch, type ComputedRef } from "vue";
import type { PictureDetailedStyle } from "@sheetcraft/core/picture-detailed-style";
import {
  getPictureOwnDetailedStyle,
  type PictureDetailedCategory,
} from "../../picture-detailed-style-edit";
import {
  PICTURE_FORMAT_GEOMETRY_FIELDS,
  canApplyPictureFormatIntent,
  clonePictureFormatOwner,
  cancelPictureFormatDraft,
  createPictureFormatDraftState,
  createPictureFormatFieldIntent,
  createPictureFormatDetailedIntent,
  editPictureFormatDraft,
  focusPictureFormatDraft,
  pictureFormatDisplayNumber,
  pictureFormatNumericValue,
  pictureFormatOwnerKey,
  pictureFormatPointsToUnit,
  reconcilePictureFormatDraftState,
  type PictureFormatBooleanField,
  type PictureFormatCapabilities,
  type PictureFormatChoiceField,
  type PictureFormatDraftField,
  type PictureFormatField,
  type PictureFormatIntent,
  type PictureFormatIntentHandler,
  type PictureFormatLengthUnit,
  type PictureFormatNumberField,
  type PictureFormatOptions,
  type PictureFormatReset,
  type PictureFormatSnapshot,
  type PictureFormatTextField,
  type PictureFormatTranslate,
  type PictureFormatValues,
} from "../../picture-format-pane-model";

export interface PictureFormatPaneInputs {
  snapshot: PictureFormatSnapshot | null;
  capabilities: PictureFormatCapabilities;
  onIntent: PictureFormatIntentHandler;
  t: PictureFormatTranslate;
  options?: PictureFormatOptions;
  loadPaintAsset?: (blob: Blob, texture?: PictureTextureId) => Promise<string | undefined>;
}
export interface PictureFormatDraftBinding {
  text: string;
  disabled: boolean;
  reason?: string;
  error?: string;
  edit: (text: unknown) => void;
  focus: () => void;
  blur: () => void;
  enter: () => void;
  keydown: (value: unknown, context: { e: KeyboardEvent }) => void;
}
export interface PictureFormatChoiceBinding {
  value?: string;
  disabled: boolean;
  reason?: string;
  error?: string;
  select: (value: unknown) => void;
}
export interface PictureFormatBooleanBinding {
  value?: boolean;
  disabled: boolean;
  reason?: string;
  error?: string;
  select: (value: unknown) => void;
}
export interface PictureFormatResetBinding {
  disabled: boolean;
  reason?: string;
  error?: string;
  activate: () => void;
}
export interface PictureFormatDetailedBinding<K extends PictureDetailedCategory> {
  ownerKey: string;
  value: PictureDetailedStyle[K];
  disabled: boolean;
  reason?: string;
  error?: string;
  apply: (value: PictureDetailedStyle[K] | undefined) => boolean;
}
export interface PictureFormatPaneController {
  snapshot: ComputedRef<PictureFormatSnapshot | null>;
  t: PictureFormatTranslate;
  number: (
    field: PictureFormatNumberField,
    unit: PictureFormatLengthUnit,
  ) => PictureFormatDraftBinding;
  text: (field: PictureFormatTextField) => PictureFormatDraftBinding;
  choice: (
    field: PictureFormatChoiceField,
    optionsAvailable?: boolean,
  ) => PictureFormatChoiceBinding;
  boolean: (field: PictureFormatBooleanField) => PictureFormatBooleanBinding;
  reset: (type: PictureFormatReset) => PictureFormatResetBinding;
  detailed: <K extends PictureDetailedCategory>(category: K) => PictureFormatDetailedBinding<K>;
  hasDetailedCapabilities: ComputedRef<boolean>;
  loadPaintAsset?: (blob: Blob, texture?: PictureTextureId) => Promise<string | undefined>;
  options: (
    field: PictureFormatChoiceField,
  ) => readonly { value: string; label: string; disabled?: boolean }[] | undefined;
  hasActiveNumericDraft: ComputedRef<boolean>;
  cancel: () => void;
}
/** Keeps a continuous edit session; component keys never depend on digits or revisions. */
export function usePictureFormatPane(props: PictureFormatPaneInputs): PictureFormatPaneController {
  const prefix = `picture-format-${useId()}`;
  const state = ref(createPictureFormatDraftState(props.snapshot));
  const bindingGeneration = ref(0);
  const detailedErrors = ref<Partial<Record<PictureDetailedCategory, string>>>({});
  const detailedCallbackGeneration = ref(0);
  watch(
    () => props.onIntent,
    () => {
      detailedCallbackGeneration.value++;
    },
  );
  function cancel() {
    bindingGeneration.value += 1;
    state.value = cancelPictureFormatDraft(state.value);
    detailedErrors.value = {};
  }
  onUnmounted(cancel);
  const snapshot = computed(() => props.snapshot);
  const t: PictureFormatTranslate = (key) => props.t(key);
  watch(
    () => props.snapshot,
    (next) => {
      if (
        !next ||
        !state.value.owner ||
        pictureFormatOwnerKey(next.owner) !== pictureFormatOwnerKey(state.value.owner)
      ) {
        bindingGeneration.value += 1;
        detailedErrors.value = {};
      }
      state.value = reconcilePictureFormatDraftState(state.value, next);
    },
    { deep: true, flush: "sync" },
  );
  // Callback replacement rejects old render callbacks through identity(), but a stable owner
  // retains drafts. A real target/context boundary belongs in owner.sessionId or ownerPath.

  function identity() {
    const ownerKey = props.snapshot ? pictureFormatOwnerKey(props.snapshot.owner) : null;
    const handler = props.onIntent;
    const generation = bindingGeneration.value;
    return () =>
      !!ownerKey &&
      !!props.snapshot &&
      pictureFormatOwnerKey(props.snapshot.owner) === ownerKey &&
      props.onIntent === handler &&
      bindingGeneration.value === generation;
  }
  function feedback(field: PictureFormatField | PictureFormatReset) {
    const error = state.value.errors[field];
    return error ? t(error) : undefined;
  }
  function dispatch(intent: PictureFormatIntent): boolean {
    if (!canApplyPictureFormatIntent(intent, props.snapshot, props.capabilities)) return false;
    try {
      return props.onIntent(intent) === true;
    } catch {
      return false;
    }
  }
  function setError(
    field: PictureFormatField | PictureFormatReset,
    error: "applyRejected" | "invalidNumber" | "outOfRange",
  ) {
    state.value = { ...state.value, errors: { ...state.value.errors, [field]: error } };
  }
  function clearError(field: PictureFormatField | PictureFormatReset) {
    const errors = { ...state.value.errors };
    delete errors[field];
    state.value = { ...state.value, errors };
  }
  function nextId() {
    state.value = { ...state.value, sequence: state.value.sequence + 1 };
    return `${prefix}-${state.value.sequence}`;
  }
  function draftBinding(
    field: PictureFormatDraftField,
    unit?: PictureFormatLengthUnit,
  ): PictureFormatDraftBinding {
    const current = props.snapshot;
    const capability = props.capabilities.fields[field];
    const draft = state.value.drafts[field];
    const value = current?.values[field];
    const formatted =
      typeof value === "number"
        ? pictureFormatDisplayNumber(
            unit && PICTURE_FORMAT_GEOMETRY_FIELDS.includes(field as PictureFormatNumberField)
              ? pictureFormatPointsToUnit(value, unit)
              : value,
          )
        : (value ?? "");
    const text =
      draft && (draft.dirty || draft.focused || draft.submitted) ? draft.text : formatted;
    const owned = identity();
    const enabled = () => owned() && props.capabilities.fields[field]?.enabled === true;
    function commit() {
      if (!enabled() || !props.snapshot) return;
      const editing = state.value.drafts[field];
      if (!editing?.dirty) return;
      const result = unit
        ? pictureFormatNumericValue(
            field as PictureFormatNumberField,
            editing.text,
            unit,
            props.capabilities.fields[field],
          )
        : { value: editing.text };
      if ("error" in result) {
        setError(field, result.error);
        return;
      }
      const intentId = nextId();
      const intent = unit
        ? createPictureFormatFieldIntent(
            props.snapshot,
            field as PictureFormatNumberField,
            result.value as number,
            intentId,
          )
        : createPictureFormatFieldIntent(
            props.snapshot,
            field as PictureFormatTextField,
            result.value as string,
            intentId,
          );
      const generation = editing.generation;
      const actionGeneration = bindingGeneration.value;
      // Register before calling a host that may synchronously update its snapshot.
      state.value = {
        ...state.value,
        drafts: {
          ...state.value.drafts,
          [field]: {
            ...editing,
            submitted: {
              intentId,
              generation,
              value: result.value,
              accepted: false,
              baseRevision: intent.baseRevision,
            },
          },
        },
      };
      const accepted = dispatch(intent);
      if (
        !props.snapshot ||
        pictureFormatOwnerKey(props.snapshot.owner) !== pictureFormatOwnerKey(intent.owner) ||
        bindingGeneration.value !== actionGeneration
      )
        return;
      const latest = state.value.drafts[field];
      if (!latest || latest.submitted?.intentId !== intentId) return;
      if (accepted) {
        clearError(field);
        state.value = {
          ...state.value,
          drafts: {
            ...state.value.drafts,
            [field]: {
              ...latest,
              dirty: latest.generation !== generation,
              submitted: {
                intentId,
                generation,
                value: result.value,
                accepted: true,
                baseRevision: intent.baseRevision,
              },
            },
          },
        };
        state.value = reconcilePictureFormatDraftState(state.value, props.snapshot);
      } else setError(field, "applyRejected");
    }
    return {
      text: String(text),
      disabled: !current || capability?.enabled !== true,
      reason: capability?.reason,
      error: feedback(field),
      edit: (next) => {
        if (enabled() && typeof next === "string")
          state.value = editPictureFormatDraft(state.value, field, next);
      },
      focus: () => {
        if (enabled())
          state.value = focusPictureFormatDraft(state.value, field, String(text), true);
      },
      blur: () => {
        if (!owned()) return;
        state.value = focusPictureFormatDraft(state.value, field, String(text), false);
        commit();
      },
      enter: commit,
      keydown: (_value, context) => {
        const event = context.e;
        if (event.key === "Escape" && owned()) {
          event.preventDefault();
          event.stopPropagation();
          state.value = cancelPictureFormatDraft(state.value, field);
        }
      },
    };
  }
  function immediate<F extends PictureFormatField>(
    field: F,
    value: PictureFormatValues[F],
    owned: () => boolean,
  ) {
    if (!owned() || !props.snapshot || props.capabilities.fields[field]?.enabled !== true) return;
    clearError(field);
    const accepted = dispatch(
      createPictureFormatFieldIntent(props.snapshot, field, value, nextId()),
    );
    if (!accepted && owned()) setError(field, "applyRejected");
  }
  return {
    snapshot,
    t,
    loadPaintAsset: props.loadPaintAsset,
    hasDetailedCapabilities: computed(() => props.capabilities.detailed !== undefined),
    number: (field, unit) => draftBinding(field, unit),
    text: (field) => draftBinding(field),
    choice: (field, optionsAvailable = true) => {
      const capability = props.capabilities.fields[field];
      const owned = identity();
      const value = props.snapshot?.values[field];
      return {
        value,
        disabled: !props.snapshot || capability?.enabled !== true || !optionsAvailable,
        reason: capability?.reason,
        error: feedback(field),
        select: (next) => {
          if (typeof next !== "string" || !optionsAvailable) return;
          if (field === "anchor" && !["move-size", "move", "fixed"].includes(next)) return;
          if (field === "lineMode" && !["inherit", "none", "solid", "gradient"].includes(next))
            return;
          const options = props.options?.[field];
          if (options && !options.some((option) => option.value === next && !option.disabled))
            return;
          immediate(field, next as PictureFormatValues[typeof field], owned);
        },
      };
    },
    boolean: (field) => {
      const capability = props.capabilities.fields[field];
      const owned = identity();
      return {
        value: props.snapshot?.values[field],
        disabled: !props.snapshot || capability?.enabled !== true,
        reason: capability?.reason,
        error: feedback(field),
        select: (next) => {
          if (typeof next === "boolean") immediate(field, next, owned);
        },
      };
    },
    reset: (type) => {
      const capability = props.capabilities.resets?.[type];
      const owned = identity();
      return {
        disabled: !props.snapshot || capability?.enabled !== true,
        reason: capability?.reason,
        error: feedback(type),
        activate: () => {
          if (!owned() || !props.snapshot || props.capabilities.resets?.[type]?.enabled !== true)
            return;
          clearError(type);
          const intent: PictureFormatIntent = {
            type,
            owner: clonePictureFormatOwner(props.snapshot.owner),
            baseRevision: props.snapshot.revision,
            intentId: nextId(),
          };
          if (!dispatch(intent) && owned()) setError(type, "applyRejected");
        },
      };
    },
    detailed: (category) => {
      const capability = props.capabilities.detailed?.[category];
      const owned = identity();
      return {
        ownerKey: props.snapshot
          ? `${pictureFormatOwnerKey(props.snapshot.owner)}:detail:${bindingGeneration.value}:${detailedCallbackGeneration.value}`
          : "",
        value: getPictureOwnDetailedStyle(props.snapshot?.appearance)?.[category],
        disabled: !props.snapshot || capability?.enabled !== true,
        reason: capability?.reason,
        error: detailedErrors.value[category],
        apply: (value) => {
          if (
            !owned() ||
            !props.snapshot ||
            props.capabilities.detailed?.[category]?.enabled !== true
          )
            return false;
          const accepted = dispatch(
            createPictureFormatDetailedIntent(props.snapshot, category, value, nextId()),
          );
          if (owned()) {
            const errors = { ...detailedErrors.value };
            if (accepted) delete errors[category];
            else errors[category] = t("applyRejected");
            detailedErrors.value = errors;
          }
          return accepted;
        },
      };
    },
    options: (field) => props.options?.[field],
    hasActiveNumericDraft: computed(() =>
      Object.entries(state.value.drafts).some(
        ([field, draft]) =>
          field !== "altTitle" &&
          field !== "altDescription" &&
          (draft?.dirty || draft?.focused || !!draft?.submitted),
      ),
    ),
    cancel,
  };
}
