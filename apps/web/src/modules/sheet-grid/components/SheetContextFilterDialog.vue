<script setup lang="ts">
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { Input } from "tdesign-vue-next/es/input";
import { computed, ref } from "vue";
import {
  areFilterValueKeysEqual,
  type FilterValueKey,
  type FilterValueOption,
} from "../../home-tools/components/data-tool-state";
import { useAppI18n } from "../../../shared/i18n";

const props = defineProps<{
  options: readonly FilterValueOption[];
  appliedKeys: readonly FilterValueKey[];
  disabled: boolean;
}>();
const emit = defineEmits<{ apply: [keys: FilterValueKey[]]; close: [] }>();
const { t } = useAppI18n();
const query = ref("");
const draft = ref(props.appliedKeys.map((key) => ({ ...key })));
const visible = computed(() =>
  props.options.filter((option) =>
    option.label.toLocaleLowerCase().includes(query.value.toLocaleLowerCase()),
  ),
);
function selected(key: FilterValueKey): boolean {
  return draft.value.some((value) => areFilterValueKeysEqual(key, value));
}
function toggle(key: FilterValueKey): void {
  draft.value = selected(key)
    ? draft.value.filter((value) => !areFilterValueKeysEqual(key, value))
    : [...draft.value, { ...key }];
}
</script>

<template>
  <Dialog
    role="dialog"
    aria-modal="true"
    :aria-label="t('contextMenu.filter')"
    :visible="true"
    :header="t('contextMenu.filter')"
    :confirm-btn="{ content: t('cellFormat.confirm'), disabled }"
    :cancel-btn="t('cellFormat.cancel')"
    :close-on-overlay-click="false"
    width="min(340px, calc(100vw - 32px))"
    @confirm="!disabled && emit('apply', draft)"
    @close="emit('close')"
  >
    <div class="sheet-context-filter-dialog">
      <Input
        v-model="query"
        :placeholder="t('contextMenu.searchFilter')"
        :aria-label="t('contextMenu.searchFilter')"
        clearable
      />
      <div class="sheet-context-filter-dialog__actions">
        <button
          type="button"
          :disabled="disabled"
          @click="draft = options.map((option) => ({ ...option.key }))"
        >
          {{ t("contextMenu.selectAll") }}
        </button>
        <button type="button" :disabled="disabled" @click="draft = []">
          {{ t("contextMenu.selectNone") }}
        </button>
      </div>
      <div class="sheet-context-filter-dialog__values">
        <Checkbox
          v-for="(option, index) in visible"
          :key="index"
          :checked="selected(option.key)"
          :disabled="disabled"
          @change="toggle(option.key)"
          >{{ option.label }}</Checkbox
        >
        <span v-if="!visible.length">{{ t("contextMenu.noFilterValues") }}</span>
      </div>
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.sheet-context-filter-dialog {
  display: grid;
  gap: 12px;
  &__actions {
    display: flex;
    gap: 12px;
    button {
      padding: 0;
      border: 0;
      background: none;
      color: var(--sheetcraft-action-primary);
      font: inherit;
      cursor: pointer;
    }
  }
  &__values {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 280px;
    overflow: auto;
  }
}
</style>
