<script setup lang="ts">
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Form as TForm, FormItem as TFormItem } from "tdesign-vue-next/es/form";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { computed, reactive, watch } from "vue";
import ColorPaletteSelect from "../../../shared/color/ColorPaletteSelect.vue";
import { useAppI18n } from "../../../shared/i18n";

export type DataBarAdvancedSettings = {
  negativeColor?: string;
  negativeBorderColor?: string;
  axisPosition: "automatic" | "middle" | "none";
  axisColor: string;
};

const props = defineProps<{
  visible: boolean;
  settings: DataBarAdvancedSettings;
  positiveColor: string;
  positiveBorderColor?: string;
}>();
const emit = defineEmits<{
  close: [];
  save: [settings: DataBarAdvancedSettings];
}>();
const { t } = useAppI18n();
const draft = reactive<DataBarAdvancedSettings>({ ...props.settings });
const axisOptions = computed(() => [
  { value: "automatic", label: t("conditionalFormatting.axisAutomatic") },
  { value: "middle", label: t("conditionalFormatting.axisMiddle") },
  { value: "none", label: t("conditionalFormatting.axisNone") },
]);

function resetDraft(): void {
  Object.assign(draft, props.settings);
}
function save(): void {
  emit("save", { ...draft });
}
watch(
  () => [props.visible, props.settings] as const,
  ([visible]) => {
    if (visible) resetDraft();
  },
  { deep: true },
);
</script>

<template>
  <Dialog
    :visible="visible"
    :header="t('conditionalFormatting.negativeAndAxis')"
    :confirm-btn="{ content: t('conditionalFormatting.save') }"
    :cancel-btn="t('conditionalFormatting.cancel')"
    :close-on-overlay-click="false"
    width="min(520px, calc(100vw - 32px))"
    placement="center"
    @confirm="save"
    @close="emit('close')"
  >
    <TForm class="data-bar-advanced-settings" layout="vertical">
      <section>
        <h3>{{ t("conditionalFormatting.negativeBarAppearance") }}</h3>
        <div class="data-bar-advanced-settings__colors">
          <TFormItem label-align="top" :label="t('conditionalFormatting.negativeFillColor')">
            <ColorPaletteSelect
              :model-value="draft.negativeColor"
              :label="t('conditionalFormatting.negativeFillColor')"
              :default-color="positiveColor"
              :default-label="t('conditionalFormatting.sameAsPositive')"
              @select="draft.negativeColor = $event ?? undefined"
            />
          </TFormItem>
          <TFormItem label-align="top" :label="t('conditionalFormatting.negativeBorderColor')">
            <ColorPaletteSelect
              :model-value="draft.negativeBorderColor"
              :label="t('conditionalFormatting.negativeBorderColor')"
              :default-color="positiveBorderColor ?? '#FFFFFF'"
              :default-label="
                positiveBorderColor
                  ? t('conditionalFormatting.sameAsPositive')
                  : t('conditionalFormatting.noBorder')
              "
              :disabled="!positiveBorderColor"
              @select="draft.negativeBorderColor = $event ?? undefined"
            />
          </TFormItem>
        </div>
      </section>
      <section>
        <h3>{{ t("conditionalFormatting.axis") }}</h3>
        <div class="data-bar-advanced-settings__colors">
          <TFormItem label-align="top" :label="t('conditionalFormatting.axisPosition')">
            <TSelect
              v-model="draft.axisPosition"
              :aria-label="t('conditionalFormatting.axisPosition')"
              :options="axisOptions"
            />
          </TFormItem>
          <TFormItem label-align="top" :label="t('conditionalFormatting.axisColor')">
            <ColorPaletteSelect
              :model-value="draft.axisColor"
              :label="t('conditionalFormatting.axisColor')"
              default-color="#000000"
              :disabled="draft.axisPosition === 'none'"
              @select="draft.axisColor = $event ?? '#000000'"
            />
          </TFormItem>
        </div>
      </section>
    </TForm>
  </Dialog>
</template>

<style scoped lang="scss">
.data-bar-advanced-settings {
  display: grid;
  gap: 20px;

  section {
    display: grid;
    gap: 8px;
  }

  h3 {
    margin: 0;
    font-size: var(--idea-font-size-body-medium);
    line-height: var(--idea-line-height-body-medium);
    font-weight: var(--idea-font-weight-semibold);
  }

  &__colors {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  @media (max-width: 480px) {
    &__colors {
      grid-template-columns: 1fr;
    }
  }
}
</style>
