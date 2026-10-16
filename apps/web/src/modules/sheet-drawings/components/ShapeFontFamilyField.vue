<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from "vue";
import FieldFeedback from "../../../shared/field-feedback/FieldFeedback.vue";
import FontFormatField from "../../../shared/cell-text/FontFormatField.vue";
import FontSettingsAction from "../../../shared/cell-text/FontSettingsAction.vue";
import { useFontCatalog } from "../../../shared/cell-text/useFontCatalog";
import { resolveFontFamilyName } from "../../../shared/cell-text/font-catalog";
import {
  cellFontResourceNeedsLoading,
  ensureCellFontResource,
  getCellFontResourceFamilies,
} from "../../../shared/cell-text/font-resources";
import { shapeFormatOwnerKey } from "../shape-format-pane-model";
import { useShapeTextFieldDraft } from "../shape-text-field-drafts";
import { focusShapeTextEditInput } from "../shape-text-edit-ownership";
import type { ShapeFormatController } from "./shape-format/useShapeFormatPane";
const props = withDefaults(
  defineProps<{
    controller: ShapeFormatController;
    sessionId?: number;
    feedbackPresentation?: "inline" | "floating";
  }>(),
  { feedbackPresentation: "inline" },
);
const root = ref<HTMLElement>();
const focused = ref(false);
const feedbackId = `shape-font-feedback-${useId()}`;
const feedback = computed(
  () =>
    error.value ||
    (pending.value
      ? props.controller.props.locale === "zh-CN"
        ? "正在载入字体…"
        : "Loading font…"
      : undefined),
);
function focusout() {
  void nextTick(() => {
    focused.value = field.value?.ownsDraftTarget(document.activeElement) ?? false;
  });
}
const field = ref<InstanceType<typeof FontFormatField>>();
const family = computed(() => props.controller.props.snapshot?.values.fontFamily);
const actualOwner = computed(() =>
  props.controller.props.snapshot
    ? shapeFormatOwnerKey(props.controller.props.snapshot.owner)
    : "none",
);
const draft = ref(family.value),
  dirty = ref(false),
  pending = ref(false),
  error = ref<string>();
let request = 0;
let editingIdentity: ReturnType<typeof identity> | undefined;
function identity() {
  return props.controller.numericIdentity.value;
}
function sameIdentity(left: ReturnType<typeof identity>, right: ReturnType<typeof identity>) {
  return (
    left.ownerKey === right.ownerKey &&
    left.lease === right.lease &&
    left.cancellation === right.cancellation
  );
}
const { fontOptions } = useFontCatalog(() =>
  [family.value, draft.value].filter((value): value is string => !!value),
);
const options = computed(() => [
  { label: props.controller.s.value("fontInherited"), value: "" },
  ...fontOptions.value.map(({ label, value, aliases }) => ({
    label,
    value,
    aliases,
    fontFamily: value,
  })),
]);
watch(actualOwner, () => {
  request++;
  draft.value = family.value;
  dirty.value = false;
  pending.value = false;
  error.value = undefined;
  editingIdentity = undefined;
});
watch(family, (value) => {
  if (!dirty.value && !pending.value) draft.value = value;
});
onBeforeUnmount(() => request++);
function input(event: Event) {
  if (!field.value?.ownsDraftTarget(event.target)) return;
  if (!dirty.value) editingIdentity = identity();
  dirty.value = true;
  error.value = undefined;
}
function submit(value: string | number): boolean {
  const c = props.controller;
  if (typeof value !== "string" || !c.fieldCapability("fontFamily").enabled) return false;
  if (editingIdentity !== undefined && !sameIdentity(editingIdentity, identity())) {
    error.value = c.s.value("staleOwner");
    return false;
  }
  const raw = value.trim(),
    option = options.value.find((option) => option.value === raw || option.label === raw);
  const next = option?.value ?? (raw === "" ? "" : resolveFontFamilyName(raw));
  const epoch = editingIdentity ?? identity(),
    owner = actualOwner.value,
    attempt = ++request;
  // Preserve the exact rejected/pending user text; canonicalize only after acceptance.
  draft.value = value;
  dirty.value = true;
  error.value = undefined;
  const current = () => attempt === request && owner === actualOwner.value;
  const apply = () => {
    pending.value = false;
    if (!current()) return false;
    if (!sameIdentity(epoch, identity())) {
      error.value = c.s.value("staleOwner");
      return false;
    }
    if (!c.session.fieldAction("fontFamily")(next)) {
      error.value = c.s.value("applyRejected");
      return false;
    }
    draft.value = next;
    dirty.value = false;
    editingIdentity = undefined;
    error.value = undefined;
    const sessionId = props.sessionId;
    void nextTick(() => {
      if (!current()) return;
      field.value?.reset();
      // The shared font menu first closes and returns focus to its trigger.
      // Restore this exact live editor only after that menu-owned return completes.
      if (sessionId !== undefined)
        void nextTick(() => {
          if (current() && props.sessionId === sessionId) focusShapeTextEditInput(sessionId);
        });
    });
    return true;
  };
  const resources = getCellFontResourceFamilies(next).filter(cellFontResourceNeedsLoading);
  if (!resources.length) return apply();
  pending.value = true;
  void Promise.all(resources.map(ensureCellFontResource)).then(
    () => {
      if (current()) apply();
    },
    () => {
      if (current()) {
        pending.value = false;
        error.value = c.s.value("fontLoadFailed");
      }
    },
  );
  return false;
}
function flush(): boolean {
  if (pending.value) return false;
  if (error.value) return false;
  if (field.value?.hasDraft()) return submit(field.value.readDraft());
  if (dirty.value) return submit(draft.value ?? "");
  return true;
}
function escape(event: KeyboardEvent) {
  const ownInput = field.value?.ownsDraftTarget(event.target);
  const ownEscapeTrigger = event.key === "Escape" && field.value?.ownsTriggerTarget(event.target);
  if (!ownInput && !ownEscapeTrigger) return;
  if (event.isComposing || event.keyCode === 229) return;
  if (event.key === "Enter" && (dirty.value || pending.value || error.value)) {
    event.preventDefault();
    event.stopPropagation();
    if (!pending.value) submit(field.value?.readDraft() ?? draft.value ?? "");
    return;
  }
  if (event.key !== "Escape" || (!dirty.value && !pending.value && !error.value)) return;
  event.preventDefault();
  event.stopPropagation();
  request++;
  draft.value = family.value;
  dirty.value = false;
  pending.value = false;
  error.value = undefined;
  editingIdentity = undefined;
  void nextTick(() => field.value?.reset());
}
useShapeTextFieldDraft({
  owner: () => props.controller.props.snapshot?.owner.sessionId,
  flush,
  focus: () => field.value?.focus(),
  blocking: () => dirty.value || pending.value || !!error.value,
  containsTarget: (target) => field.value?.containsTarget(target) ?? false,
});
defineExpose({ flush, focus: () => field.value?.focus() });
</script>
<template>
  <div
    ref="root"
    class="shape-font-family-field"
    @input.capture="input"
    @keydown.capture="escape"
    @focusin="focused = true"
    @focusout="focusout"
  >
    <FontFormatField
      ref="field"
      :model-value="draft"
      :options="options"
      :label="controller.s.value('fontFamily')"
      :placeholder="
        !dirty && controller.isMixedField('fontFamily')
          ? controller.s.value('mixedValues')
          : undefined
      "
      :search-label="controller.s.value('fontSearch')"
      :empty-label="controller.s.value('fontEmpty')"
      :described-by="feedback ? feedbackId : undefined"
      :disabled="!controller.fieldCapability('fontFamily').enabled"
      @change="submit"
    >
      <template #searchAction="{ close }"><FontSettingsAction @open="close" /></template>
    </FontFormatField>
    <FieldFeedback
      :id="feedbackId"
      :message="feedback"
      :invalid="!!error"
      :status="pending"
      :presentation="feedbackPresentation"
      :anchor="root"
      :active="focused"
    />
  </div>
</template>
<style scoped lang="scss">
.shape-font-family-field {
  min-width: 0;
  &__feedback {
    margin: 0;
    color: var(--sheetcraft-text-secondary);
    font-size: 12px;
    line-height: 18px;
  }
}
</style>
