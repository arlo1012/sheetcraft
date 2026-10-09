<script setup lang="ts">
import { computed, ref } from "vue";
import { BaseTable } from "tdesign-vue-next/es/table";
import { Input } from "tdesign-vue-next/es/input";
import { Plus, Trash2 } from "lucide-vue-next";
import { vIconAction } from "../../../shared/focus/icon-action";
import { parseTsvToCellTexts } from "@sheetcraft/core/clipboard";
import TableHeightWrapper from "../../../shared/table/TableHeightWrapper.vue";
import { useAppI18n } from "../../../shared/i18n";
const props = defineProps<{ firstLabel: string; secondLabel: string }>();
const model = defineModel<{ word: string; replacement: string }[]>({ required: true });
const { t } = useAppI18n();
const error = ref("");
const rows = computed(() => model.value.map((row, index) => ({ ...row, index })));
const columns = computed(() => [
  { colKey: "word", title: props.firstLabel },
  { colKey: "replacement", title: props.secondLabel },
  { colKey: "actions", title: "", width: 60 },
]);
function update(index: number, key: "word" | "replacement", value: string) {
  const row = model.value[index];
  if (row) row[key] = value;
}
function insert(index: number) {
  if (model.value.length >= 5000) return;
  const next = [...model.value];
  next.splice(index + 1, 0, { word: "", replacement: "" });
  model.value = next;
}
function remove(index: number) {
  const next = model.value.filter((_, i) => i !== index);
  model.value = next.length ? next : [{ word: "", replacement: "" }];
}
function paste(event: ClipboardEvent, index: number, column: number) {
  const text = event.clipboardData?.getData("text/plain");
  if (!text || !/[\t\r\n]/.test(text)) return;
  event.preventDefault();
  event.stopPropagation();
  if (text.length > 2_000_000) {
    error.value = t("wordProof.pasteInvalid");
    return;
  }
  const values = parseTsvToCellTexts(text);
  if (values.some((row) => row.length > 2 - column) || index + values.length > 5000) {
    error.value = t("wordProof.pasteInvalid");
    return;
  }
  const next = model.value.map((row) => ({ ...row }));
  values.forEach((row, offset) => {
    const target = next[index + offset] ?? { word: "", replacement: "" };
    row.forEach((value, c) => {
      target[column + c === 0 ? "word" : "replacement"] = value;
    });
    next[index + offset] = target;
  });
  model.value = next;
  error.value = "";
}
</script>
<template>
  <div class="dictionary-entry">
    <p v-if="error" role="alert">{{ error }}</p>
    <div class="dictionary-entry__table">
      <TableHeightWrapper v-slot="{ height }">
        <BaseTable
          class="idea-table--mini idea-table--row-dividers"
          size="small"
          row-key="index"
          :data="rows"
          :columns="columns"
          :height="height"
          table-layout="fixed"
          :bordered="false"
        >
          <template #word="{ row }">
            <div @paste.capture="paste($event, row.index, 0)">
              <Input
                :value="row.word"
                :aria-label="`${firstLabel} ${row.index + 1}`"
                @change="update(row.index, 'word', String($event))"
              />
            </div>
          </template>
          <template #replacement="{ row }">
            <div @paste.capture="paste($event, row.index, 1)">
              <Input
                :value="row.replacement"
                :aria-label="`${secondLabel} ${row.index + 1}`"
                @change="update(row.index, 'replacement', String($event))"
              />
            </div>
          </template>
          <template #actions="{ row }">
            <div class="dictionary-entry__actions" @dblclick.stop>
              <span
                v-icon-action
                :aria-label="t('wordProof.remove')"
                :title="t('wordProof.remove')"
                @click.stop="remove(row.index)"
                ><Trash2 class="idea-action-icon" aria-hidden="true"
              /></span>
              <span
                v-icon-action="model.length >= 5000"
                :aria-label="t('wordProof.addRow')"
                :title="t('wordProof.addRow')"
                @click.stop="insert(row.index)"
                ><Plus class="idea-action-icon" aria-hidden="true"
              /></span>
            </div>
          </template>
        </BaseTable>
      </TableHeightWrapper>
    </div>
  </div>
</template>
<style scoped lang="scss">
.dictionary-entry {
  display: grid;
  gap: 8px;
  &__table {
    height: 240px;
    min-height: 0;
  }
  &__actions {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--sheetcraft-space-2);
    > span {
      width: 24px;
      height: 28px;
    }
  }
  p {
    margin: 0;
    color: var(--sheetcraft-text-secondary);
  }
}
</style>
