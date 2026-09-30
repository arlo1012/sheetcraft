<script setup lang="ts">
import { computed } from "vue";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { PrimaryTable as TTable } from "tdesign-vue-next/es/table";
import type { PrimaryTableCol } from "tdesign-vue-next/es/table/type";
import RangeReferenceInput from "../../../shared/range-reference/RangeReferenceInput.vue";
import { useAppI18n } from "../../../shared/i18n";
import type {
  DataProofreadingDraft,
  DataProofreadingIssue,
  DataProofreadingIssueKind,
} from "../data-proofreading-types";

const props = withDefaults(
  defineProps<{
    visible: boolean;
    draft: DataProofreadingDraft;
    issues: readonly DataProofreadingIssue[];
    hasScanned?: boolean;
    selectedIds: readonly string[];
    error?: string;
    busy?: boolean;
    picking?: boolean;
    selectReference?: (current: string) => Promise<string | undefined>;
  }>(),
  { error: "", busy: false, picking: false, hasScanned: false, selectReference: undefined },
);
const emit = defineEmits<{
  close: [];
  draftChange: [draft: DataProofreadingDraft];
  scan: [draft: DataProofreadingDraft];
  selectionChange: [ids: string[]];
  selectIssue: [id: string];
  applyIssue: [id: string];
  applyType: [type: DataProofreadingIssueKind];
  applySelected: [];
  ignoreIssue: [id: string];
  ignoreType: [type: DataProofreadingIssueKind];
}>();
const { t, locale } = useAppI18n();
const rows = computed(() => [...props.issues]);
const columns = computed<PrimaryTableCol[]>(() => [
  {
    colKey: "row-select",
    type: "multiple",
    width: 36,
    align: "center",
    disabled: ({ row }) => props.busy || !row.safe,
  },
  { colKey: "type", title: t("proofreading.type"), width: 72 },
  { colKey: "reason", title: t("proofreading.reason"), width: 160, ellipsis: true },
  { colKey: "address", title: t("proofreading.address"), width: 84 },
  { colKey: "currentValue", title: t("proofreading.currentValue"), ellipsis: true },
  { colKey: "proposedValue", title: t("proofreading.proposedValue"), ellipsis: true },
  {
    colKey: "actions",
    title: t("proofreading.action"),
    width: locale.value === "zh-CN" ? 240 : 336,
    fixed: "right",
    align: "center",
  },
]);

const selected = computed(() => new Set(props.selectedIds));
const safeSelectedCount = computed(
  () => props.issues.filter((issue) => issue.safe && selected.value.has(issue.id)).length,
);

function issueTypeLabel(type: DataProofreadingIssueKind): string {
  return t(`proofreading.types.${type}`);
}

function updateRange(range: string): void {
  emit("draftChange", { range });
}
function selectIssues(keys: Array<string | number>): void {
  if (props.busy) return;
  const safeIds = new Set(props.issues.filter((issue) => issue.safe).map((issue) => issue.id));
  emit(
    "selectionChange",
    keys.filter((key): key is string => typeof key === "string" && safeIds.has(key)),
  );
}
</script>

<template>
  <Dialog
    role="dialog"
    aria-modal="true"
    width="min(980px, calc(100vw - 32px))"
    :visible="visible && !picking"
    :header="t('proofreading.title')"
    :aria-label="t('proofreading.title')"
    :close-btn="!busy"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    @close="emit('close')"
  >
    <div class="data-proofreading-dialog">
      <div class="data-proofreading-dialog__toolbar">
        <RangeReferenceInput
          clearable
          :model-value="draft.range"
          :disabled="busy"
          :label="t('proofreading.range')"
          :pick-label="t('proofreading.pickRange')"
          :select-reference="selectReference"
          :placeholder="t('proofreading.rangePlaceholder')"
          @update:model-value="updateRange"
          @enter="!busy && emit('scan', draft)"
        />
        <TButton :loading="busy" :disabled="busy" @click="emit('scan', draft)">
          {{ hasScanned ? t("proofreading.rescan") : t("proofreading.scan") }}
        </TButton>
      </div>

      <div v-if="error" class="data-proofreading-dialog__error" role="alert">{{ error }}</div>
      <div v-else-if="!issues.length" class="data-proofreading-dialog__empty">
        {{ hasScanned ? t("proofreading.noIssues") : t("proofreading.scanHint") }}
      </div>

      <TTable
        v-if="hasScanned && issues.length"
        class="idea-table--mini"
        row-key="id"
        :data="rows"
        :columns="columns"
        :selected-row-keys="[...selectedIds]"
        :bordered="false"
        :aria-label="t('proofreading.title')"
        size="small"
        table-layout="fixed"
        vertical-align="middle"
        max-height="min(48vh, 440px)"
        hover
        @select-change="selectIssues"
      >
        <template #type="{ row }">
          {{ issueTypeLabel(row.type) }}
        </template>
        <template #reason="{ row }">
          {{ t(`proofreading.reasons.${row.reason}`) }}
        </template>
        <template #address="{ row }">
          <TButton
            variant="text"
            size="small"
            :disabled="busy"
            @click="emit('selectIssue', row.id)"
          >
            {{ row.address }}
          </TButton>
        </template>
        <template #proposedValue="{ row }">
          {{ row.proposedValue ?? t("proofreading.unsafe") }}
        </template>
        <template #actions="{ row }">
          <div class="data-proofreading-dialog__actions">
            <TButton
              size="small"
              variant="text"
              :disabled="busy || !row.safe"
              @click="emit('applyIssue', row.id)"
            >
              {{ t("proofreading.apply") }}
            </TButton>
            <TButton
              size="small"
              variant="text"
              :disabled="busy"
              @click="emit('ignoreIssue', row.id)"
            >
              {{ t("proofreading.ignore") }}
            </TButton>
            <TButton
              size="small"
              variant="text"
              :disabled="busy || !row.safe"
              @click="emit('applyType', row.type)"
            >
              {{ t("proofreading.applyType") }}
            </TButton>
            <TButton
              size="small"
              variant="text"
              :disabled="busy"
              @click="emit('ignoreType', row.type)"
            >
              {{ t("proofreading.ignoreType") }}
            </TButton>
          </div>
        </template>
      </TTable>
    </div>
    <template #footer>
      <div class="data-proofreading-dialog__footer">
        <div class="data-proofreading-dialog__summary" aria-live="polite">
          <span v-if="issues.length">{{ t("proofreading.issues", { count: issues.length }) }}</span>
          <span>{{ t("proofreading.selected", { count: safeSelectedCount }) }}</span>
        </div>
        <div class="data-proofreading-dialog__footer-actions">
          <TButton theme="default" :disabled="busy" @click="emit('close')">{{
            t("proofreading.close")
          }}</TButton>
          <TButton
            theme="primary"
            :disabled="busy || safeSelectedCount === 0"
            @click="emit('applySelected')"
          >
            {{ t("proofreading.applySelected") }}
          </TButton>
        </div>
      </div>
    </template>
  </Dialog>
</template>

<style scoped lang="scss">
.data-proofreading-dialog {
  display: grid;
  gap: 12px;

  &__toolbar,
  &__footer,
  &__summary,
  &__actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__toolbar > :first-child {
    flex: 1;
  }
  &__error {
    color: var(--idea-status-error);
  }
  &__summary,
  &__empty {
    color: var(--idea-text-secondary);
  }
  &__summary {
    flex-wrap: wrap;
    gap: 12px;
  }
  &__actions {
    justify-content: center;
    flex-wrap: wrap;
    gap: 4px;
  }
  &__footer {
    justify-content: space-between;
    color: var(--idea-text-secondary);
  }
  &__footer-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
  }
}
</style>
