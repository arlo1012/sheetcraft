<script setup lang="ts">
import { ref } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Form, FormItem } from "tdesign-vue-next/es/form";
import RangeReferenceInput from "../../../shared/range-reference/RangeReferenceInput.vue";
import { useAppI18n } from "../../../shared/i18n";
const props = defineProps<{
  initial: string;
  failed: boolean;
  suspended: boolean;
  selectReference: (current: string) => Promise<string | undefined>;
}>();
const emit = defineEmits<{ confirm: [value: string]; close: [] }>();
const { t } = useAppI18n();
const reference = ref(props.initial);
</script>
<template>
  <Dialog
    :visible="!suspended"
    role="dialog"
    aria-modal="true"
    :aria-label="t('sparkline.dateAxisTitle')"
    :header="t('sparkline.dateAxisTitle')"
    width="min(460px, calc(100vw - 32px))"
    :close-on-overlay-click="false"
    :confirm-btn="{ content: t('picture.confirm'), disabled: !reference.trim() }"
    :cancel-btn="t('picture.cancel')"
    @confirm="emit('confirm', reference)"
    @close="emit('close')"
  >
    <Form label-align="top" :prevent-submit-default="true">
      <FormItem :label="t('sparkline.dateRange')"
        ><RangeReferenceInput
          v-model="reference"
          :label="t('sparkline.dateRange')"
          :select-reference="selectReference"
      /></FormItem>
    </Form>
    <p v-if="failed" role="alert">{{ t("sparkline.invalidDateRange") }}</p>
  </Dialog>
</template>
