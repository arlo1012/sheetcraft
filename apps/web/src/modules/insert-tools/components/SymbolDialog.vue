<script setup lang="ts">
import { ref } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Input } from "tdesign-vue-next/es/input";
import { useAppI18n } from "../../../shared/i18n";
const props = defineProps<{ disabled: boolean }>();
const emit = defineEmits<{ insert: [symbol: string]; close: [] }>();
const { t } = useAppI18n();
const selected = ref("✓");
const symbols = [..."✓✔✗✘★☆●○■□◆◇▲△▼▽←→↑↓↔↕∞≈≠≤≥±×÷√∑∏∫∂∆πΩαβγδεθλμσφω©®™℃℉€£¥₩§¶‰°²³¼½¾"];
function insert() {
  if (!props.disabled && selected.value) emit("insert", selected.value);
}
</script>
<template>
  <Dialog
    :visible="true"
    :header="t('drawing.symbol')"
    width="460px"
    :confirm-btn="{ content: t('drawing.insert'), disabled: disabled || !selected }"
    :cancel-btn="t('picture.cancel')"
    @confirm="insert"
    @close="emit('close')"
  >
    <div class="symbol-dialog">
      <div class="symbol-dialog__grid" role="group" :aria-label="t('drawing.symbol')">
        <button
          v-for="symbol in symbols"
          :key="symbol"
          type="button"
          :aria-pressed="selected === symbol"
          @click="selected = symbol"
          @dblclick="
            selected = symbol;
            insert();
          "
        >
          {{ symbol }}
        </button>
      </div>
      <label>{{ t("drawing.customSymbol") }}<Input v-model="selected" :maxlength="16" /></label>
    </div>
  </Dialog>
</template>
<style scoped lang="scss">
.symbol-dialog {
  display: grid;
  gap: 16px;
  &__grid {
    display: grid;
    grid-template-columns: repeat(10, 1fr);
    gap: 4px;
    button {
      height: 34px;
      font-size: 20px;
      color: var(--sheetcraft-text-primary);
      background: var(--sheetcraft-surface-default);
      border: 1px solid var(--sheetcraft-border-default);
      cursor: pointer;
      &[aria-pressed="true"] {
        border-color: var(--sheetcraft-action-primary);
        background: var(--sheetcraft-surface-hover);
      }
    }
  }
  label {
    display: flex;
    align-items: center;
    gap: 12px;
  }
}
</style>
