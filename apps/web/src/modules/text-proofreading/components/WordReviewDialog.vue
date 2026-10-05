<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Button } from "tdesign-vue-next/es/button";
import { Input } from "tdesign-vue-next/es/input";
import { Select, Option } from "tdesign-vue-next/es/select";
import { PrimaryTable } from "tdesign-vue-next/es/table";
import type { PrimaryTableCol } from "tdesign-vue-next/es/table/type";
import { formatCellAddress } from "@idea10/core/coordinates";
import TableHeightWrapper from "../../../shared/table/TableHeightWrapper.vue";
import { useAppI18n } from "../../../shared/i18n";
import type { useWordProofreading } from "../useWordProofreading";
const props = defineProps<{ controller: ReturnType<typeof useWordProofreading> }>();
const { t } = useAppI18n();
const replacements = ref<Record<string, string>>({});
watch([() => props.controller.panel.value, () => props.controller.scope.value], () => {
  replacements.value = {};
});
function replacementFor(id: string) {
  const issue = props.controller.issues.value.find((issue) => issue.id === id);
  return replacements.value[id] ?? issue?.replacement ?? "";
}
function correct(id: string) {
  const issue = props.controller.issues.value.find((issue) => issue.id === id);
  const replacement = replacementFor(id);
  if (issue && replacement && replacement !== issue.word)
    props.controller.apply([{ ...issue, replacement }]);
}
function accept(id: string) {
  const issue = props.controller.issues.value.find((issue) => issue.id === id);
  if (issue && props.controller.add(issue.word)) scan();
}
const rows = computed(() =>
  props.controller.issues.value.map((i) => {
    const cell = props.controller.cells.value[i.cell]!;
    return {
      ...i,
      location: `${cell.sheetName}!${formatCellAddress(cell.address)}`,
      context: cell.text,
    };
  }),
);
const columns = computed<PrimaryTableCol[]>(() => [
  ...(props.controller.panel.value === "batch"
    ? [{ colKey: "row-select", type: "multiple" as const, width: 42 }]
    : []),
  { colKey: "location", title: t("wordProof.location"), width: 130 },
  { colKey: "context", title: t("wordProof.context"), ellipsis: true },
  { colKey: "word", title: t("wordProof.word"), width: 110 },
  { colKey: "replacement", title: t("wordProof.replacement"), width: 150 },
  { colKey: "actions", title: t("proofreading.action"), width: 180 },
]);
const applicable = computed(() =>
  props.controller.issues.value
    .filter((issue) => props.controller.selected.value.includes(issue.id))
    .map((issue) => ({ ...issue, replacement: replacementFor(issue.id) }))
    .filter((issue) => issue.replacement && issue.replacement !== issue.word),
);
function applySelected() {
  props.controller.apply(applicable.value);
}
function scan() {
  replacements.value = {};
  props.controller.scan();
}
</script>
<template>
  <Dialog
    :visible="controller.panel.value === 'general' || controller.panel.value === 'batch'"
    :header="t(controller.panel.value === 'batch' ? 'wordProof.batch' : 'wordProof.general')"
    width="960px"
    :close-on-overlay-click="false"
    @close="controller.panel.value = undefined"
  >
    <div class="word-review">
      <div class="word-review__toolbar">
        <span>{{ t("wordProof.scope") }}</span>
        <Select
          v-model="controller.scope.value"
          :aria-label="t('wordProof.scope')"
          class="word-review__scope"
        >
          <Option value="selection" :label="t('wordProof.selection')" />
          <Option value="sheet" :label="t('wordProof.sheet')" />
          <Option value="workbook" :label="t('wordProof.workbook')" />
        </Select>
      </div>
      <p v-if="controller.error.value" role="alert">{{ controller.error.value }}</p>
      <p v-if="controller.skipped.value" class="word-review__hint">
        {{ t("wordProof.skipped", { count: controller.skipped.value }) }}
      </p>
      <p v-if="controller.truncated.value" role="status">{{ t("wordProof.truncated") }}</p>
      <div class="word-review__table">
        <TableHeightWrapper v-slot="{ height }">
          <PrimaryTable
            class="idea-table--mini idea-table--row-dividers"
            row-key="id"
            :data="rows"
            :columns="columns"
            :height="height"
            size="small"
            table-layout="fixed"
            vertical-align="middle"
            :bordered="false"
            hover
            resizable
            :selected-row-keys="controller.selected.value"
            :empty="t(controller.scanned.value ? 'wordProof.empty' : 'wordProof.noScan')"
            @select-change="controller.selected.value = $event.map(String)"
          >
            <template #replacement="{ row }">
              <Input
                :value="replacementFor(row.id)"
                :aria-label="`${t('wordProof.replacement')} ${row.location}`"
                @change="replacements[row.id] = String($event)"
              />
            </template>
            <template #actions="{ row }">
              <div class="word-review__row-actions">
                <Button
                  size="small"
                  variant="text"
                  :disabled="!replacementFor(row.id) || replacementFor(row.id) === row.word"
                  @click="correct(row.id)"
                  >{{ t("wordProof.replace") }}</Button
                >
                <Button size="small" variant="text" @click="controller.ignore([row.id])">{{
                  t("wordProof.ignore")
                }}</Button>
                <Button size="small" variant="text" @click="accept(row.id)">{{
                  t("wordProof.accepted")
                }}</Button>
              </div>
            </template>
          </PrimaryTable>
        </TableHeightWrapper>
      </div>
    </div>
    <template #footer>
      <div class="word-review__footer">
        <div class="word-review__summary" aria-live="polite">
          <span v-if="controller.scanned.value">{{
            t("wordProof.count", { count: controller.issues.value.length })
          }}</span>
          <span v-if="controller.panel.value === 'batch'">{{
            t("proofreading.selected", { count: controller.selected.value.length })
          }}</span>
        </div>
        <div class="word-review__footer-actions">
          <Button theme="default" @click="controller.panel.value = undefined">{{
            t("wordProof.close")
          }}</Button>
          <Button
            v-if="controller.panel.value === 'batch'"
            theme="primary"
            :disabled="!applicable.length"
            @click="applySelected"
            >{{ t("wordProof.applySelected") }}</Button
          >
          <Button @click="scan">{{ t("wordProof.scan") }}</Button>
        </div>
      </div>
    </template>
  </Dialog>
</template>
<style scoped lang="scss">
.word-review {
  display: grid;
  gap: 12px;
  p {
    margin: 0;
  }
  &__toolbar,
  &__footer,
  &__summary {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  &__scope {
    width: 180px;
  }
  &__hint,
  &__summary {
    color: var(--idea-text-secondary);
  }
  &__table {
    height: min(320px, calc(100dvh - 280px));
    min-height: 0;
  }
  &__row-actions {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
  }
  &__footer {
    justify-content: space-between;
  }
  &__summary {
    flex-wrap: wrap;
    gap: 12px;
  }
  &__footer-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
  }
}
</style>
