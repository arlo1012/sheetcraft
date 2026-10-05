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
const rows = computed(() =>
  props.controller.issues.value.map((i) => {
    const cell = props.controller.cells.value[i.cell]!;
    return {
      ...i,
      location: `${cell.sheetName}!${formatCellAddress(cell.address)}`,
      context: cell.text,
      kindLabel: t(
        i.kind === "sensitive"
          ? "wordProof.sensitive"
          : i.kind === "terms"
            ? "wordProof.terms"
            : i.kind === "people"
              ? "wordProof.people"
              : "wordProof.incorrectWord",
      ),
    };
  }),
);
const columns = computed<PrimaryTableCol[]>(() => [
  { colKey: "row-select", type: "multiple", width: 42 },
  { colKey: "location", title: t("wordProof.location"), width: 130 },
  { colKey: "context", title: t("wordProof.context"), ellipsis: true },
  { colKey: "kindLabel", title: t("wordProof.issueKind"), width: 100 },
  { colKey: "word", title: t("wordProof.word"), width: 110 },
  { colKey: "replacement", title: t("wordProof.replacement"), width: 150 },
  { colKey: "actions", title: t("proofreading.action"), width: 180, align: "center" },
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
    :visible="controller.panel.value === 'review'"
    :header="t('wordProof.review')"
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
        <div class="word-review__toolbar-actions">
          <Button theme="default" @click="controller.open('accepted')">{{
            t("wordProof.accepted")
          }}</Button>
          <Button
            theme="default"
            :disabled="
              !controller.issues.value.some(
                (issue) =>
                  controller.selected.value.includes(issue.id) && issue.kind !== 'sensitive',
              )
            "
            @click="controller.acceptSelected() && (replacements = {})"
            >{{ t("wordProof.acceptSelected") }}</Button
          >
          <Button
            theme="default"
            :disabled="!controller.selected.value.length"
            @click="controller.ignore(controller.selected.value)"
            >{{ t("wordProof.ignoreSelected") }}</Button
          >
        </div>
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
            <template #location="{ row }">
              <Button
                size="small"
                variant="text"
                theme="primary"
                @click="controller.selectIssue(row.id)"
              >
                {{ row.location }}
              </Button>
            </template>
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
                <Button
                  size="small"
                  variant="text"
                  :disabled="row.kind === 'sensitive'"
                  @click="controller.add(row.word) && scan()"
                  >{{ t("wordProof.acceptWord") }}</Button
                >
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
          <span>{{ t("proofreading.selected", { count: controller.selected.value.length }) }}</span>
        </div>
        <div class="word-review__footer-actions">
          <Button theme="default" @click="controller.panel.value = undefined">{{
            t("wordProof.close")
          }}</Button>
          <Button theme="primary" :disabled="!applicable.length" @click="applySelected">{{
            t("wordProof.applySelected")
          }}</Button>
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
  &__toolbar-actions {
    margin-left: auto;
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
