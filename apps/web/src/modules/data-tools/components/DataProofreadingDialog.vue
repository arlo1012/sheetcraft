<script setup lang="ts">
import { computed } from "vue";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { Dialog } from "tdesign-vue-next/es/dialog";
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
const { t } = useAppI18n();

const selected = computed(() => new Set(props.selectedIds));
const safeSelectedCount = computed(
  () => props.issues.filter((issue) => issue.safe && selected.value.has(issue.id)).length,
);
const canScan = computed(() => Boolean(props.draft.range.trim()));

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
          placeholder="Sheet1!A1:C10"
          @update:model-value="updateRange"
          @enter="canScan && !busy && emit('scan', draft)"
        />
        <TButton :loading="busy" :disabled="busy || !canScan" @click="emit('scan', draft)">
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

      <div v-if="hasScanned && issues.length" class="data-proofreading-dialog__list" role="table">
        <div class="data-proofreading-dialog__row data-proofreading-dialog__row--head" role="row">
          <span aria-hidden="true"></span>
          <span role="columnheader">{{ t("proofreading.type") }}</span>
          <span role="columnheader">{{ t("proofreading.address") }}</span>
          <span role="columnheader">{{ t("proofreading.currentValue") }}</span>
          <span role="columnheader">{{ t("proofreading.proposedValue") }}</span>
          <span role="columnheader">{{ t("proofreading.action") }}</span>
        </div>
        <div
          v-for="issue in issues"
          :key="issue.id"
          class="data-proofreading-dialog__row"
          role="row"
        >
          <TCheckbox
            :checked="selected.has(issue.id)"
            :disabled="busy || !issue.safe"
            :aria-label="`${t('proofreading.applySelected')} ${issue.address}`"
            @change="toggleIssue(issue.id, Boolean($event))"
          />
          <span role="cell" :title="t(`proofreading.reasons.${issue.reason}`)">
            {{ t(`proofreading.types.${issue.type}`) }}
            <small class="data-proofreading-dialog__reason">{{
              t(`proofreading.reasons.${issue.reason}`)
            }}</small>
          </span>
          <TButton
            variant="text"
            size="small"
            :disabled="busy"
            @click="emit('selectIssue', issue.id)"
          >
            {{ issue.address }}
          </TButton>
          <span role="cell" class="data-proofreading-dialog__value">{{ issue.currentValue }}</span>
          <span role="cell" class="data-proofreading-dialog__value">
            {{ issue.proposedValue ?? t("proofreading.unsafe") }}
          </span>
          <span class="data-proofreading-dialog__actions" role="cell">
            <TButton
              size="small"
              variant="text"
              :disabled="busy || !issue.safe"
              @click="emit('applyIssue', issue.id)"
            >
              {{ t("proofreading.apply") }}
            </TButton>
            <TButton
              size="small"
              variant="text"
              :disabled="busy"
              @click="emit('ignoreIssue', issue.id)"
            >
              {{ t("proofreading.ignore") }}
            </TButton>
            <TButton
              size="small"
              variant="text"
              :disabled="busy || !issue.safe"
              @click="emit('applyType', issue.type)"
            >
              {{ t("proofreading.applyType") }}
            </TButton>
            <TButton
              size="small"
              variant="text"
              :disabled="busy"
              @click="emit('ignoreType', issue.type)"
            >
              {{ t("proofreading.ignoreType") }}
            </TButton>
          </span>
        </div>
      </div>
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
  &__list {
    max-height: min(48vh, 440px);
    overflow: auto;
    border: 1px solid var(--idea-border-control);
  }
  &__row {
    display: grid;
    grid-template-columns: 34px 100px 90px minmax(120px, 1fr) minmax(120px, 1fr) 134px;
    align-items: center;
    min-width: 720px;
    min-height: 42px;
    border-bottom: 1px solid var(--idea-border-control);
    padding: 0 8px;
    gap: 8px;
  }
  &__row:last-child {
    border-bottom: 0;
  }
  &__row--head {
    min-height: 36px;
    font-weight: 600;
    background: var(--idea-surface-secondary);
  }
  &__value {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
