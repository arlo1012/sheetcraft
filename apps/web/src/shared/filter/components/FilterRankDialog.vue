<script setup lang="ts">
import { ref } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import type { SheetFilterCondition } from "@idea10/core/workbook";
import { useAppI18n } from "../../i18n";
import FilterRankEditor from "./FilterRankEditor.vue";
type RankCondition = Extract<SheetFilterCondition, { kind: "rank" }>;
defineProps<{ visible: boolean; initial?: RankCondition; disabled?: boolean }>();
const emit = defineEmits<{ close: []; apply: [condition: RankCondition] }>();
const { t } = useAppI18n();
const condition = ref<RankCondition>();
</script>
<template>
  <Dialog
    :visible="visible"
    :header="t('dataTools.filter.topItemsTitle')"
    width="min(400px, calc(100vw - 32px))"
    placement="center"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    :confirm-btn="{ content: t('dataTools.common.confirm'), disabled: disabled || !condition }"
    :cancel-btn="t('dataTools.common.cancel')"
    @close="emit('close')"
    @confirm="!disabled && condition && emit('apply', condition)"
  >
    <FilterRankEditor
      v-if="visible"
      @update:condition="condition = $event"
      class="filter-rank-dialog"
      :initial="initial"
      :disabled="disabled"
    />
  </Dialog>
</template>
