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
const current = computed(() => props.controller.issues.value[0]);
const currentCell = computed(
  () => current.value && props.controller.cells.value[current.value.cell],
);
const replacement = ref("");
watch(current, (i) => (replacement.value = i?.replacement ?? ""), { immediate: true });
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
  { colKey: "row-select", type: "multiple", width: 42 },
  { colKey: "location", title: t("wordProof.location"), width: 140 },
  { colKey: "word", title: t("wordProof.word"), width: 120 },
  { colKey: "replacement", title: t("wordProof.replacement"), width: 120 },
  { colKey: "context", title: t("wordProof.context"), ellipsis: true },
]);
function applySelected() {
  props.controller.apply(
    props.controller.issues.value.filter((i) => props.controller.selected.value.includes(i.id)),
  );
}
</script>
<template>
  <Dialog
    :visible="controller.panel.value === 'general' || controller.panel.value === 'batch'"
    :header="t(controller.panel.value === 'batch' ? 'wordProof.batch' : 'wordProof.general')"
    :width="controller.panel.value === 'batch' ? '900px' : '600px'"
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
        <Button variant="outline" @click="controller.scan">{{ t("wordProof.scan") }}</Button>
        <span v-if="controller.scanned.value" class="word-review__count">{{
          t("wordProof.count", { count: controller.issues.value.length })
        }}</span>
      </div>
      <p v-if="controller.error.value" role="alert">{{ controller.error.value }}</p>
      <p v-if="controller.skipped.value" class="word-review__hint">
        {{ t("wordProof.skipped", { count: controller.skipped.value }) }}
      </p>
      <p v-if="controller.truncated.value" role="status">{{ t("wordProof.truncated") }}</p>
      <template v-if="controller.scanned.value">
        <div v-if="controller.panel.value === 'batch'" class="word-review__table">
          <TableHeightWrapper v-slot="{ height }">
            <PrimaryTable
              row-key="id"
              :data="rows"
              :columns="columns"
              :height="height"
              table-layout="fixed"
              resizable
              :selected-row-keys="controller.selected.value"
              :empty="t('wordProof.empty')"
              @select-change="controller.selected.value = $event.map(String)"
            />
          </TableHeightWrapper>
        </div>
        <template v-else-if="current && currentCell">
          <div class="word-review__original">
            <div class="word-review__metadata">
              <span>{{ t("wordProof.context") }}</span>
              <span>{{ currentCell.sheetName }}!{{ formatCellAddress(currentCell.address) }}</span>
            </div>
            <div class="word-review__context">
              {{ currentCell.text.slice(Math.max(0, current.start - 80), current.start)
              }}<mark>{{ current.word }}</mark
              >{{ currentCell.text.slice(current.end, current.end + 100) }}
            </div>
          </div>
          <div class="word-review__replacement">
            <span>{{ t("wordProof.replacement") }}</span>
            <Input v-model="replacement" :aria-label="t('wordProof.replacement')" />
          </div>
        </template>
        <p v-else class="word-review__empty" role="status">{{ t("wordProof.empty") }}</p>
      </template>
      <p v-else class="word-review__empty" role="status">{{ t("wordProof.noScan") }}</p>
    </div>
    <template #footer>
      <div class="word-review__footer">
        <Button
          class="word-review__close"
          variant="outline"
          @click="controller.panel.value = undefined"
          >{{ t("wordProof.close") }}</Button
        >
        <template v-if="controller.panel.value === 'batch'">
          <Button
            variant="outline"
            :disabled="!controller.selected.value.length"
            @click="controller.ignore(controller.selected.value)"
            >{{ t("wordProof.ignoreSelected") }}</Button
          >
          <Button :disabled="!controller.selected.value.length" @click="applySelected">{{
            t("wordProof.applySelected")
          }}</Button>
        </template>
        <template v-else-if="controller.scanned.value && current">
          <Button variant="outline" @click="controller.add(current.word) && controller.scan()">{{
            t("wordProof.accepted")
          }}</Button>
          <Button variant="outline" @click="controller.ignore([current.id])">{{
            t("wordProof.ignore")
          }}</Button>
          <Button
            :disabled="!replacement || replacement === current.word"
            @click="controller.apply([{ ...current, replacement }])"
            >{{ t("wordProof.replace") }}</Button
          >
        </template>
      </div>
    </template>
  </Dialog>
</template>
<style scoped lang="scss">
.word-review {
  display: grid;
  gap: 16px;
  p {
    margin: 0;
  }
  &__toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  &__scope {
    width: 156px;
  }
  &__count {
    margin-left: auto;
    color: var(--td-text-color-secondary);
  }
  &__hint {
    color: var(--td-text-color-secondary);
  }
  &__original {
    display: grid;
    gap: 8px;
  }
  &__metadata {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    color: var(--td-text-color-secondary);
    overflow-wrap: anywhere;
  }
  &__context {
    min-height: 76px;
    max-height: 180px;
    overflow: auto;
    padding: 12px;
    border-radius: var(--td-radius-default);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    background: var(--td-bg-color-secondarycontainer);
    mark {
      color: var(--td-warning-color);
      background: var(--td-warning-color-light);
      border-radius: 2px;
    }
  }
  &__replacement {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 12px;
  }
  &__table {
    height: 320px;
    min-height: 0;
  }
  &__empty {
    padding: 24px 0;
    text-align: center;
    color: var(--td-text-color-secondary);
  }
  &__footer {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  &__close {
    margin-right: auto;
  }
}
</style>
