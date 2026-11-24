<script setup lang="ts">
import { computed } from "vue";
import OptionList from "../../../shared/option-list/OptionList.vue";
import { useAppI18n } from "../../../shared/i18n";
import { SPECIAL_SYMBOLS } from "../symbols/symbol-dialog-model";
import { symbolCharacterCode } from "../symbols/unicode-catalog";

const props = defineProps<{
  visible: boolean;
  specialIndex: number;
  selectedFamily: (text: string) => string | undefined;
}>();

const emit = defineEmits<{
  "update:specialIndex": [index: number];
  insert: [];
}>();

const { t } = useAppI18n();

const specialOptions = computed(() =>
  SPECIAL_SYMBOLS.map((entry, index) => ({
    value: String(index),
    label: t(`symbolTools.${entry.label}`),
    text: entry.text,
  })),
);

function selectSpecial(value: string): void {
  emit("update:specialIndex", Number(value));
}

function activateSpecial(value: string): void {
  selectSpecial(value);
  emit("insert");
}
</script>

<template>
  <section
    v-show="visible"
    class="symbol-dialog__page symbol-dialog__page--fill"
    :aria-label="t('symbolTools.special')"
  >
    <OptionList
      class="symbol-dialog__special-list"
      :model-value="String(specialIndex)"
      :options="specialOptions"
      :label="t('symbolTools.special')"
      item-data-attribute="data-symbol-special"
      @select="selectSpecial"
      @activate="activateSpecial"
    >
      <template #icon="{ option }">
        <span
          class="symbol-dialog__list-glyph"
          :title="`U+${symbolCharacterCode(option.text.codePointAt(0)!)}`"
          :style="{ fontFamily: selectedFamily(option.text) }"
          >{{ /\s/u.test(option.text) ? "␣" : option.text }}</span
        >
      </template>
    </OptionList>
  </section>
</template>

<style scoped lang="scss">
.symbol-dialog {
  &__page {
    display: flex;
    flex: none;
    flex-direction: column;
    gap: 6px;
    min-height: 0;
    min-width: 0;
    > * {
      flex-shrink: 0;
    }
    &--fill {
      flex: 1 0 280px;
    }
  }
  &__special-list {
    flex: 1 1 0;
    min-height: 180px;
  }
  &__list-glyph {
    flex: 0 0 36px;
    max-width: 64px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: center;
    font-size: 23px;
    line-height: 28px;
  }
}
</style>
