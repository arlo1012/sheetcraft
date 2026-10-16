<script setup lang="ts">
import { computed, ref, useId, watch } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { useAppI18n } from "../../../shared/i18n";
import NumericField from "../../../shared/numeric-field/NumericField.vue";
import type {
  NumericCandidate,
  NumericCommitResult,
  NumericDraftChange,
  NumericFieldSpec,
} from "../../../shared/numeric-field/types";
import {
  pictureBatchHeightPreview,
  type PictureBatchSizeScopes,
} from "../picture-batch-size-preview";
const props = defineProps<{
  width: number;
  height: number;
  error?: string;
  ownerKey?: string;
  sizeScopes?: PictureBatchSizeScopes;
}>();
const emit = defineEmits<{
  confirm: [value: { width: number; height: number; locked: boolean; all: boolean }];
  close: [];
}>();
const { t } = useAppI18n();
const fallbackOwner = useId();
const owner = computed(() => props.ownerKey ?? fallbackOwner);
const width = ref(props.width);
const height = ref(props.height);
const locked = ref(true);
const all = ref(false);
const widthControl = ref<InstanceType<typeof NumericField>>();
const heightControl = ref<InstanceType<typeof NumericField>>();
const widthDraft = ref<NumericDraftChange>();
watch(
  owner,
  () => {
    width.value = props.width;
    height.value = props.height;
    locked.value = true;
    all.value = false;
    widthDraft.value = undefined;
  },
  { flush: "sync" },
);
const spec = computed<NumericFieldSpec>(() => ({
  displayUnit: t("pictureFormat.unitPt"),
  toDisplay: (value) => value * 0.75,
  fromDisplay: (value) => (value * 4) / 3,
  displayPrecision: 2,
  displayStep: 1,
  canonicalBounds: { min: 1, max: 10000 },
  parsePolicy: { scientific: true },
}));
const previewWidth = computed(() => {
  const draft = widthDraft.value;
  if (!draft?.dirty) return width.value;
  return draft.valid && !draft.composing && !draft.stale ? (Number(draft.text) * 4) / 3 : undefined;
});
const derivedHeight = computed(() =>
  pictureBatchHeightPreview(
    previewWidth.value,
    props.sizeScopes?.[all.value ? "all" : "selected"] ?? [
      { width: props.width, height: props.height },
    ],
  ),
);
const widthCommit = computed(() => {
  const captured = owner.value;
  return (candidate: NumericCandidate): NumericCommitResult => {
    if (captured !== owner.value || candidate.kind !== "value")
      return { accepted: false, error: t("picture.operationFailed") };
    width.value = candidate.value;
    return { accepted: true };
  };
});
const heightCommit = computed(() => {
  const captured = owner.value;
  return (candidate: NumericCandidate): NumericCommitResult => {
    if (captured !== owner.value || locked.value || candidate.kind !== "value")
      return { accepted: false, error: t("picture.operationFailed") };
    height.value = candidate.value;
    return { accepted: true };
  };
});
function updateWidthDraft(draft: NumericDraftChange) {
  if (draft.ownerKey === owner.value) widthDraft.value = draft;
}
function confirm() {
  if (widthControl.value?.commit("external") === false) return;
  if (!locked.value && heightControl.value?.commit("external") === false) return;
  emit("confirm", {
    width: width.value,
    height: height.value,
    locked: locked.value,
    all: all.value,
  });
}
</script>
<template>
  <Dialog
    :visible="true"
    :header="t('picture.batchSize')"
    width="400px"
    :close-on-overlay-click="false"
    :confirm-btn="t('picture.confirm')"
    :cancel-btn="t('picture.cancel')"
    @confirm="confirm"
    @close="emit('close')"
  >
    <div class="picture-batch-size">
      <p v-if="error" role="alert">{{ error }}</p>
      <NumericField
        ref="widthControl"
        data-picture-batch-width
        :owner-key="owner"
        :value="{ kind: 'value', value: width }"
        :spec="spec"
        :label="t('image.widthPoints')"
        :invalid-message="t('picture.invalidSize')"
        :rejected-message="t('picture.operationFailed')"
        :on-commit="widthCommit"
        presentation="inline-stepper"
        show-label
        @draft-change="updateWidthDraft"
      />
      <NumericField
        ref="heightControl"
        data-picture-batch-height
        :owner-key="`${owner}:${locked ? 'ratio' : 'explicit'}`"
        :value="locked ? derivedHeight : { kind: 'value', value: height }"
        :disabled="locked"
        :spec="spec"
        :label="t('image.heightPoints')"
        :mixed-text="t('format.mixed')"
        :empty-text="t('pictureFormat.notAvailable')"
        :invalid-message="t('picture.invalidSize')"
        :rejected-message="t('picture.operationFailed')"
        :on-commit="heightCommit"
        presentation="inline-stepper"
        show-label
      />
      <Checkbox v-model="locked">{{ t("picture.keepEachRatio") }}</Checkbox>
      <Checkbox v-model="all">{{ t("picture.allPictures") }}</Checkbox>
    </div>
  </Dialog>
</template>
<style scoped lang="scss">
.picture-batch-size {
  display: grid;
  gap: 12px;
}
</style>
