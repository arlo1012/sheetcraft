<script setup lang="ts">
import { computed } from "vue";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { BaseTable as TTable } from "tdesign-vue-next/es/table";
import type { BaseTableCol } from "tdesign-vue-next/es/table/type";
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
const columns = computed<BaseTableCol<DataProofreadingIssue>[]>(() => [
  { colKey: "selection", title: "", width: 36, align: "center" },
  { colKey: "type", title: t("proofreading.type"), width: 160 },
  { colKey: "address", title: t("proofreading.address"), width: 84 },
  { colKey: "currentValue", title: t("proofreading.currentValue"), ellipsis: true },
  { colKey: "proposedValue", title: t("proofreading.proposedValue"), ellipsis: true },
  {
    colKey: "actions",
    title: t("proofreading.action"),
    width: locale.value === "zh-CN" ? 240 : 336,
    fixed: "right",
  },
]);

const selected = computed(() => new Set(props.selectedIds));
const safeSelectedCount = computed(
  () => props.issues.filter((issue) => issue.safe && selected.value.has(issue.id)).length,
);

function updateRange(range: string): void {
  emit("draftChange", { range });
}
function toggleIssue(id: string, checked: boolean): void {
  const next = new Set(props.selectedIds);
  if (checked) next.add(id);
  else next.delete(id);
  emit("selectionChange", [...next]);
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
          {{ issues.length ? t("proofreading.rescan") : t("proofreading.scan") }}
        </TButton>
      </div>

      <p v-if="error" class="data-proofreading-dialog__error" role="alert">{{ error }}</p>
      <p v-else-if="issues.length" class="data-proofreading-dialog__summary">
        {{ t("proofreading.issues", { count: issues.length }) }}
      </p>
      <p v-else class="data-proofreading-dialog__empty">
        {{ hasScanned ? t("proofreading.noIssues") : t("proofreading.scanHint") }}
      </p>

      <TTable
        v-if="hasScanned && issues.length"
        class="idea-table--mini"
        row-key="id"
        :data="rows"
        :columns="columns"
        :active-row-keys="[...selectedIds]"
        :bordered="false"
        :aria-label="t('proofreading.title')"
        size="small"
        table-layout="fixed"
        max-height="min(48vh, 440px)"
        hover
      >
        <template #selection="{ row }">
          <TCheckbox
            :checked="selected.has(row.id)"
            :disabled="busy || !row.safe"
            :aria-label="`${t('proofreading.applySelected')} ${row.address}`"
            @change="toggleIssue(row.id, Boolean($event))"
          />
        </template>
        <template #type="{ row }">
          <div :title="t(`proofreading.reasons.${row.reason}`)">
            {{ t(`proofreading.types.${row.type}`) }}
            <span class="data-proofreading-dialog__reason">{{
              t(`proofreading.reasons.${row.reason}`)
            }}</span>
          </div>
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
        <span>{{ t("proofreading.selected", { count: safeSelectedCount }) }}</span>
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
  &__footer-actions,
  &__actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__toolbar > :first-child {
    flex: 1;
  }
  &__error {
    margin: 0;
    color: var(--idea-status-error);
  }
  &__summary,
  &__empty {
    margin: 0;
    color: var(--idea-text-secondary);
  }
  &__actions {
    flex-wrap: wrap;
    gap: 4px;
  }
  &__reason {
    display: block;
    color: var(--idea-text-secondary);
    font-weight: 400;
  }
  &__footer {
    justify-content: space-between;
    color: var(--idea-text-secondary);
  }
  &__footer-actions {
    flex-wrap: wrap;
    justify-content: flex-end;
  }
}
</style>
