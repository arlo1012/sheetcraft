import { computed, onScopeDispose, ref, shallowRef, watch } from "vue";
import type {
  NumericCandidate,
  NumericCommitContext,
  NumericDraftChange,
  NumericDraftInputs,
  NumericFieldSpec,
  NumericValue,
} from "./types";

let nextSession = 0;
function equal(a: NumericValue, b: NumericValue): boolean {
  return a.kind === b.kind && (a.kind !== "value" || (b.kind === "value" && a.value === b.value));
}
export function formatNumericValue(value: NumericValue, spec: NumericFieldSpec): string {
  if (value.kind !== "value") return "";
  const displayed = spec.toDisplay ? spec.toDisplay(value.value) : value.value;
  if (!Number.isFinite(displayed)) return "";
  return spec.displayPrecision === undefined
    ? String(displayed)
    : String(Number(displayed.toFixed(spec.displayPrecision)));
}
export function parseNumericDraft(
  text: string,
  spec: NumericFieldSpec,
): NumericCandidate | undefined {
  let input = text.trim();
  if (!input)
    return spec.allowAuto ? { kind: "auto" } : spec.allowEmpty ? { kind: "empty" } : undefined;
  if (spec.parsePolicy?.decimalComma) input = input.replace(",", ".");
  const pattern = spec.parsePolicy?.scientific
    ? /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i
    : /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
  if (!pattern.test(input)) return;
  const displayed = Number(input);
  const value = spec.fromDisplay ? spec.fromDisplay(displayed) : displayed;
  if (!Number.isFinite(value) || (spec.integer && !Number.isInteger(value))) return;
  const bounds = spec.canonicalBounds;
  if (
    (bounds?.min !== undefined &&
      (bounds.minExclusive ? value <= bounds.min : value < bounds.min)) ||
    (bounds?.max !== undefined && (bounds.maxExclusive ? value >= bounds.max : value > bounds.max))
  )
    return;
  return { kind: "value", value: Object.is(value, -0) ? 0 : value };
}
export function useNumericDraft(
  props: NumericDraftInputs,
  changed: (value: NumericDraftChange) => void = () => {},
) {
  const live = ref(true);
  onScopeDispose(() => {
    live.value = false;
  });
  const text = ref(formatNumericValue(props.value, props.spec));
  const stale = ref(false);
  const dirty = ref(false),
    composing = ref(false),
    focused = ref(false);
  const error = ref<string>();
  const accepted = ref<NumericValue>(props.value);
  const sessionSpec = shallowRef(props.spec);
  const activeSpec = computed(() => (dirty.value ? sessionSpec.value : props.spec));
  let owner = props.ownerKey;
  let handler = props.onCommit;
  let sessionId = "";
  let generation = 0;
  let gesture = false;
  let lastAttempt = -1;
  const editable = computed(() => live.value && !props.disabled && !props.readOnly);
  const parsed = computed(() => parseNumericDraft(text.value, activeSpec.value));
  function notify() {
    changed({
      text: text.value,
      dirty: dirty.value,
      composing: composing.value,
      valid: !!parsed.value,
      stale: stale.value,
      ownerKey: owner,
    });
  }
  function reset() {
    owner = props.ownerKey;
    handler = props.onCommit;
    accepted.value = props.value;
    text.value = formatNumericValue(props.value, props.spec);
    dirty.value = false;
    stale.value = false;
    composing.value = false;
    error.value = undefined;
    gesture = false;
    sessionId = "";
    sessionSpec.value = props.spec;
    generation++;
    lastAttempt = -1;
    notify();
  }
  watch(() => props.ownerKey, reset, { flush: "sync" });
  watch(
    () => props.value,
    (value) => {
      accepted.value = value;
      if (dirty.value || composing.value) return;
      text.value = formatNumericValue(value, props.spec);
    },
    { deep: true, flush: "sync" },
  );
  watch(
    () => props.spec,
    () => {
      // A unit switch cannot reinterpret an old dirty string in a new unit.
      // Owners must commit/cancel before changing units; otherwise retain no stale draft.
      if (!dirty.value && !composing.value)
        text.value = formatNumericValue(accepted.value, props.spec);
    },
    { deep: true },
  );
  watch(
    () => props.onCommit,
    (next) => {
      if (dirty.value && handler !== next) {
        stale.value = true;
        error.value = props.staleMessage ?? props.rejectedMessage;
        notify();
      }
    },
    { flush: "sync" },
  );
  function begin() {
    if (!dirty.value) {
      handler = props.onCommit;
      stale.value = false;
      owner = props.ownerKey;
      sessionId = `numeric-${++nextSession}`;
      sessionSpec.value = { ...props.spec, canonicalBounds: { ...props.spec.canonicalBounds } };
    }
  }
  function edit(value: unknown) {
    if (!editable.value || typeof value !== "string" || value === text.value) return;
    begin();
    text.value = value;
    dirty.value = true;
    error.value = stale.value ? (props.staleMessage ?? props.rejectedMessage) : undefined;
    generation++;
    notify();
  }
  function commit(source: NumericCommitContext["source"] = "external"): boolean {
    if (composing.value) return false;
    if (!editable.value || !dirty.value) return !dirty.value;
    // Blur after an explicit failed submission must not dispatch the same edit again.
    if (source === "blur" && lastAttempt === generation) return false;
    if (owner !== props.ownerKey || handler !== props.onCommit) {
      stale.value = true;
      error.value = props.staleMessage ?? props.rejectedMessage;
      return false;
    }
    const candidate = parseNumericDraft(text.value, activeSpec.value);
    if (!candidate) {
      error.value = props.invalidMessage;
      return false;
    }
    if (candidate.kind === "value") {
      const invalid = activeSpec.value.validateCanonical?.(candidate.value);
      if (invalid) {
        error.value = invalid;
        return false;
      }
    }
    if (equal(candidate, accepted.value)) {
      dirty.value = false;
      error.value = undefined;
      text.value = formatNumericValue(accepted.value, props.spec);
      notify();
      return true;
    }
    const capture = generation;
    lastAttempt = generation;
    let result;
    try {
      result = handler(candidate, { ownerKey: owner, sessionId, source });
    } catch {
      result = { accepted: false as const, error: props.rejectedMessage };
    }
    if (capture !== generation || owner !== props.ownerKey) return false;
    if (!result.accepted) {
      error.value = result.error;
      return false;
    }
    accepted.value = result.value ?? candidate;
    dirty.value = false;
    error.value = undefined;
    text.value = formatNumericValue(accepted.value, props.spec);
    notify();
    return true;
  }
  function cancel() {
    gesture = false;
    stale.value = false;
    composing.value = false;
    text.value = formatNumericValue(accepted.value, props.spec);
    dirty.value = false;
    error.value = undefined;
    generation++;
    notify();
  }
  function setComposing(value: boolean, actualText?: string) {
    composing.value = value;
    if (!value && actualText !== undefined) edit(actualText);
    notify();
  }
  function canStep(direction: -1 | 1): boolean {
    if (!editable.value || composing.value || stale.value) return false;
    if (!(activeSpec.value.displayStep && activeSpec.value.displayStep > 0)) return false;
    const current = dirty.value ? parsed.value : accepted.value;
    if (current?.kind !== "value") return false;
    const bounds = activeSpec.value.canonicalBounds;
    const increasing =
      !activeSpec.value.fromDisplay ||
      activeSpec.value.fromDisplay(1) > activeSpec.value.fromDisplay(0);
    const sign = increasing ? direction : -direction;
    return sign > 0
      ? bounds?.max === undefined || current.value < bounds.max
      : bounds?.min === undefined || current.value > bounds.min;
  }
  function step(direction: -1 | 1) {
    if (!canStep(direction)) return;
    const current = dirty.value ? parsed.value : accepted.value;
    if (current?.kind !== "value") return;
    const display = activeSpec.value.toDisplay
      ? activeSpec.value.toDisplay(current.value)
      : current.value;
    const nextDisplay = Number(
      (display + direction * activeSpec.value.displayStep!).toPrecision(15),
    );
    let canonical = activeSpec.value.fromDisplay
      ? activeSpec.value.fromDisplay(nextDisplay)
      : nextDisplay;
    const bounds = activeSpec.value.canonicalBounds;
    if (bounds?.min !== undefined && canonical < bounds.min) {
      if (bounds.minExclusive) return;
      canonical = bounds.min;
    }
    if (bounds?.max !== undefined && canonical > bounds.max) {
      if (bounds.maxExclusive) return;
      canonical = bounds.max;
    }
    const boundedDisplay = activeSpec.value.toDisplay
      ? activeSpec.value.toDisplay(canonical)
      : canonical;
    edit(String(boundedDisplay));
    if (!parsed.value) error.value = props.invalidMessage;
  }
  function beginGesture() {
    gesture = true;
  }
  function endGesture() {
    if (!gesture) return;
    gesture = false;
    commit("step");
  }
  return {
    text,
    dirty,
    composing,
    focused,
    error,
    stale,
    accepted,
    parsed,
    editable,
    activeSpec,
    edit,
    commit,
    cancel,
    setComposing,
    canStep,
    step,
    beginGesture,
    endGesture,
  };
}
