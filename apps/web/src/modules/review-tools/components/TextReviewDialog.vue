<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Dialog as TDialog } from "tdesign-vue-next/es/dialog";
import { Select as TSelect, Option as TOption } from "tdesign-vue-next/es/select";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Form as TForm, FormItem as TFormItem } from "tdesign-vue-next/es/form";
import { formatCellAddress } from "@sheetcraft/core/coordinates";
import { useAppI18n } from "../../../shared/i18n";
import type {
  ReviewTextCell,
  SpellingLanguage,
  TextReviewResult,
  TextReviewScope,
} from "../text-review";
const props = defineProps<{
  scope: TextReviewScope;
  language: SpellingLanguage;
  cells: readonly ReviewTextCell[];
  result?: TextReviewResult;
  busy: boolean;
  error: string;
  skipped: number;
}>();
const emit = defineEmits<{
  close: [];
  run: [];
  "update:scope": [value: TextReviewScope];
  "update:language": [value: SpellingLanguage];
  replace: [value: string, all: boolean];
  ignore: [all: boolean];
}>();
const { t } = useAppI18n();
const current = computed(() => props.result?.issues[0]);
const currentCell = computed(() => current.value && props.cells[current.value.cell]);
const replacement = ref("");
watch(current, (issue) => {
  replacement.value = issue?.suggestions[0] ?? issue?.word ?? "";
});
function location(cell: ReviewTextCell) {
  return `${cell.sheetName}!${formatCellAddress(cell.address)}`;
}
</script>
<template>
  <TDialog
    :visible="true"
    :header="t('review.spelling')"
    width="660px"
    :footer="false"
    :close-on-overlay-click="false"
    @close="emit('close')"
  >
    <div class="text-review">
      <p class="text-review__hint">
        {{ t("review.spellingHint") }}
      </p>
      <TForm layout="inline" label-align="top">
        <TFormItem :label="t('review.reviewScope')">
          <TSelect
            :value="scope"
            :disabled="busy"
            @change="emit('update:scope', $event as TextReviewScope)"
          >
            <TOption value="selection" :label="t('review.scopeSelection')" />
            <TOption value="sheet" :label="t('review.scopeSheet')" />
            <TOption value="workbook" :label="t('review.scopeWorkbook')" />
          </TSelect>
        </TFormItem>
        <TFormItem :label="t('review.spellingLanguage')">
          <TSelect
            :value="language"
            :disabled="busy"
            @change="emit('update:language', $event as SpellingLanguage)"
          >
            <TOption value="en-US" :label="t('review.englishUS')" />
            <TOption value="en-GB" :label="t('review.englishGB')" />
          </TSelect>
        </TFormItem>
        <TFormItem
          ><TButton :loading="busy" @click="emit('run')">{{
            t("review.checkAgain")
          }}</TButton></TFormItem
        >
      </TForm>
      <p v-if="skipped">{{ t("review.skippedProtected", { count: skipped }) }}</p>
      <p v-if="busy" role="status">{{ t("review.checking") }}</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <template v-if="result && !busy">
        <p v-if="result.truncated" role="status">{{ t("review.reviewTruncated") }}</p>
        <template v-if="current && currentCell">
          <p>
            {{ location(currentCell) }} ·
            {{ t("review.issuesRemaining", { count: result.issues.length }) }}
          </p>
          <div class="text-review__context">
            {{ currentCell.text.slice(Math.max(0, current.start - 80), current.start)
            }}<mark>{{ current.word }}</mark
            >{{ currentCell.text.slice(current.end, current.end + 100) }}
          </div>
          <TForm label-align="top">
            <TFormItem :label="t('review.replaceWith')"><TInput v-model="replacement" /></TFormItem>
          </TForm>
          <div class="text-review__suggestions">
            <TButton
              v-for="word in current.suggestions"
              :key="word"
              size="small"
              variant="outline"
              @click="replacement = word"
              >{{ word }}</TButton
            >
            <span v-if="!current.suggestions.length">{{ t("review.noSuggestions") }}</span>
          </div>
          <div class="text-review__actions">
            <TButton @click="emit('replace', replacement, false)">{{
              t("review.replace")
            }}</TButton>
            <TButton variant="outline" @click="emit('replace', replacement, true)">{{
              t("review.replaceAll")
            }}</TButton>
            <TButton variant="outline" @click="emit('ignore', false)">{{
              t("review.ignoreOnce")
            }}</TButton>
            <TButton variant="outline" @click="emit('ignore', true)">{{
              t("review.ignoreAll")
            }}</TButton>
          </div>
        </template>
        <p v-else role="status">
          {{ t(result.truncated ? "review.checkNextBatch" : "review.spellingComplete") }}
        </p>
      </template>
    </div>
  </TDialog>
</template>
<style scoped lang="scss">
.text-review {
  display: grid;
  gap: 16px;
  p {
    margin: 0;
  }
  &__hint {
    color: var(--td-text-color-secondary);
  }
  &__context {
    padding: 12px;
    background: var(--td-bg-color-secondarycontainer);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  &__suggestions,
  &__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
}
</style>
