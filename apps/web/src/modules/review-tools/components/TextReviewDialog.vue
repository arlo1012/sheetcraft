<script setup lang="ts">
import TableHeightWrapper from "../../../shared/table/TableHeightWrapper.vue";
import { BaseTable } from "tdesign-vue-next/es/table";
import type { BaseTableCol } from "tdesign-vue-next/es/table/type";
import { computed, ref, watch } from "vue";
import { Dialog as TDialog } from "tdesign-vue-next/es/dialog";
import { Select as TSelect, Option as TOption } from "tdesign-vue-next/es/select";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Form as TForm, FormItem as TFormItem } from "tdesign-vue-next/es/form";
import { formatCellAddress } from "@idea10/core/coordinates";
import { useAppI18n } from "../../../shared/i18n";
import type {
  ReviewTextCell,
  SpellingLanguage,
  TextReviewMode,
  TextReviewResult,
  TextReviewScope,
} from "../text-review";
const props = defineProps<{
  mode?: TextReviewMode;
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
  convert: [];
}>();
const { t } = useAppI18n();
const current = computed(() => props.result?.issues[0]);
const currentCell = computed(() => current.value && props.cells[current.value.cell]);
const replacement = ref("");
watch(current, (issue) => {
  replacement.value = issue?.suggestions[0] ?? issue?.word ?? "";
});
const title = computed(() =>
  t(
    props.mode === "spelling"
      ? "review.spelling"
      : props.mode === "to-simplified"
        ? "review.toSimplified"
        : "review.toTraditional",
  ),
);
const conversionRows = computed(() =>
  (props.result?.conversions ?? []).slice(0, 50).map((change) => ({
    id: change.cell,
    address: location(props.cells[change.cell]!),
    before: props.cells[change.cell]!.text,
    after: change.text,
  })),
);
const conversionColumns = computed<BaseTableCol[]>(() => [
  { colKey: "address", title: t("review.address"), width: 130, ellipsis: true },
  { colKey: "before", title: t("review.beforeConversion"), ellipsis: true },
  { colKey: "after", title: t("review.afterConversion"), ellipsis: true },
]);
function location(cell: ReviewTextCell) {
  return `${cell.sheetName}!${formatCellAddress(cell.address)}`;
}
</script>
<template>
  <TDialog
    :visible="mode === 'spelling'"
    :header="title"
    width="660px"
    :footer="false"
    :close-on-overlay-click="false"
    @close="emit('close')"
  >
    <div class="text-review">
      <p class="text-review__hint">
        {{ t(mode === "spelling" ? "review.spellingHint" : "review.conversionHint") }}
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
        <TFormItem v-if="mode === 'spelling'" :label="t('review.spellingLanguage')">
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
        <template v-if="mode === 'spelling'">
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
              <TFormItem :label="t('review.replaceWith')"
                ><TInput v-model="replacement"
              /></TFormItem>
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
        <template v-else>
          <p>{{ t("review.conversionCount", { count: result.conversions.length }) }}</p>
          <div v-if="result.conversions.length" class="text-review__preview">
            <TableHeightWrapper v-slot="{ height }">
              <BaseTable
                class="idea-table--mini idea-table--row-dividers"
                row-key="id"
                :data="conversionRows"
                :columns="conversionColumns"
                :height="height"
                size="small"
                table-layout="fixed"
                :bordered="false"
                hover
              />
            </TableHeightWrapper>
          </div>
          <p v-if="result.conversions.length > 50">{{ t("review.previewLimit") }}</p>
          <TButton :disabled="!result.conversions.length" @click="emit('convert')">{{
            t("review.applyConversion")
          }}</TButton>
        </template>
      </template>
      <div class="text-review__footer">
        <TButton variant="outline" @click="emit('close')">{{ t("review.close") }}</TButton>
      </div>
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
  &__preview {
    height: min(280px, calc(100dvh - 320px));
    min-height: 0;
  }
  &__footer {
    display: flex;
    justify-content: flex-end;
  }
}
</style>
