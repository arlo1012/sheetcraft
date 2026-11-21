<script setup lang="ts">
import { ref } from "vue";
import { Checkbox, CheckboxGroup } from "tdesign-vue-next/es/checkbox";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { useAppI18n } from "../../../shared/i18n";
defineProps<{ fields: readonly { id: string; name: string }[] }>();
const emit = defineEmits<{ confirm: [ids: string[]]; close: [] }>();
const { t } = useAppI18n(),
  selected = ref<string[]>([]);
</script>
<template>
  <Dialog
    role="dialog"
    aria-modal="true"
    :aria-label="t('tables.insertSlicer')"
    :header="t('tables.insertSlicer')"
    visible
    width="min(300px, calc(100vw - 32px))"
    :close-on-overlay-click="false"
    :confirm-btn="{ content: t('tables.confirm'), disabled: !selected.length }"
    :cancel-btn="t('tables.cancel')"
    @close="emit('close')"
    @confirm="emit('confirm', selected)"
  >
    <CheckboxGroup v-model="selected" class="slicer-fields">
      <Checkbox v-for="field in fields" :key="field.id" :value="field.id">{{
        field.name
      }}</Checkbox>
    </CheckboxGroup>
  </Dialog>
</template>
<style scoped lang="scss">
.slicer-fields {
  display: grid;
  gap: 6px;
  max-height: min(50vh, 320px);
  overflow: auto;
  padding: 4px;
}
</style>
