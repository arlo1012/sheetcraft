<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Info } from "lucide-vue-next";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Form as TForm, FormItem as TFormItem } from "tdesign-vue-next/es/form";
import { Radio as TRadio, RadioGroup as TRadioGroup } from "tdesign-vue-next/es/radio";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import RangeReferenceInput from "../../../shared/range-reference/RangeReferenceInput.vue";
import { useAppI18n } from "../../../shared/i18n";
import type { FillRankDraft } from "../fill-number-types";

const props = withDefaults(
  defineProps<{
    visible: boolean;
    initial: FillRankDraft;
    error?: string;
    picking?: boolean;
    selectSourceReference?: (current: string) => Promise<string | undefined>;
    selectDestinationReference?: (current: string) => Promise<string | undefined>;
  }>(),
  { error: "", picking: false },
);
const emit = defineEmits<{ close: []; apply: [draft: FillRankDraft] }>();
const { t, locale } = useAppI18n();
const copy = (value: FillRankDraft): FillRankDraft => ({ ...value });
const draft = ref(copy(props.initial));
const canApply = computed(() =>
  Boolean(draft.value.sourceRange.trim() && draft.value.destination.trim()),
);
const tieOptions = computed(() => [
  { label: t("dataTools.fill.rankCompetition"), value: "competition" },
  { label: t("dataTools.fill.rankDense"), value: "dense" },
  { label: t("dataTools.fill.rankOrdinal"), value: "ordinal" },
]);

watch(
  () => props.visible,
  (visible, previous) => {
    if (visible && !previous) draft.value = copy(props.initial);
  },
);
watch(
  () => props.initial,
  (value) => {
    if (props.visible && !props.picking) draft.value = copy(value);
  },
);

function apply(): void {
  if (canApply.value) emit("apply", copy(draft.value));
}
</script>

<template>
  <Dialog
    :visible="visible && !picking"
    :header="t('dataTools.fill.rank')"
    width="min(480px, calc(100vw - 32px))"
    :confirm-btn="{ content: t('dataTools.fill.apply'), disabled: !canApply }"
    :cancel-btn="t('dataTools.fill.cancel')"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    @close="emit('close')"
    @confirm="apply"
  >
    <div class="fill-rank-dialog">
      <p class="fill-rank-dialog__hint">
        <Info :size="14" aria-hidden="true" />
        <span>{{ t("dataTools.fill.rankHint") }}</span>
      </p>
      <TForm :data="draft" label-align="right" :label-width="locale === 'zh-CN' ? 72 : 112">
        <TFormItem name="sourceRange" :label="t('dataTools.fill.rankSource')">
          <div class="fill-rank-dialog__reference">
            <RangeReferenceInput
              v-model="draft.sourceRange"
              :label="t('dataTools.fill.rankSource')"
              :pick-label="t('dataTools.fill.pickRankSource')"
              :select-reference="selectSourceReference"
            />
          </div>
        </TFormItem>
        <TFormItem name="destination" :label="t('dataTools.fill.rankDestination')">
          <div class="fill-rank-dialog__reference">
            <RangeReferenceInput
              v-model="draft.destination"
              :label="t('dataTools.fill.rankDestination')"
              :pick-label="t('dataTools.fill.pickRankDestination')"
              :select-reference="selectDestinationReference"
            />
          </div>
        </TFormItem>
        <TFormItem name="order" :label="t('dataTools.fill.rankOrder')">
          <TRadioGroup v-model="draft.order" :aria-label="t('dataTools.fill.rankOrder')">
            <TRadio value="descending">{{ t("dataTools.fill.rankDescending") }}</TRadio>
            <TRadio value="ascending">{{ t("dataTools.fill.rankAscending") }}</TRadio>
          </TRadioGroup>
        </TFormItem>
        <TFormItem name="ties" :label="t('dataTools.fill.rankTies')">
          <TSelect
            v-model="draft.ties"
            :options="tieOptions"
            :aria-label="t('dataTools.fill.rankTies')"
          />
        </TFormItem>
        <TFormItem name="overwrite">
          <div class="fill-rank-dialog__feedback">
            <TCheckbox v-model="draft.overwrite">{{ t("dataTools.fill.rankOverwrite") }}</TCheckbox>
            <p v-if="error" class="fill-rank-dialog__error" role="alert">{{ error }}</p>
          </div>
        </TFormItem>
      </TForm>
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
@use "./fill-dialog";

.fill-rank-dialog {
  @include fill-dialog.surface;

  &__feedback {
    @include fill-dialog.group;
  }

  &__hint,
  &__error {
    @include fill-dialog.auxiliary-text;
  }

  &__hint {
    @include fill-dialog.subdued-text;
    display: flex;
    align-items: flex-start;
    gap: var(--idea-space-2);

    > svg {
      flex: none;
      margin-top: var(--idea-space-1);
    }
  }

  &__error {
    color: var(--idea-status-error);
  }

  &__reference {
    width: 100%;
    min-width: 0;
  }
}
</style>
