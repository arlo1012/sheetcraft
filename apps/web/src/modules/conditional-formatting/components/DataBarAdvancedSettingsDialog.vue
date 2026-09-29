<script setup lang="ts">
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Radio as TRadio, RadioGroup as TRadioGroup } from "tdesign-vue-next/es/radio";
import { reactive, watch } from "vue";
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
  positiveBorderColor?: string;
}>();
const emit = defineEmits<{
  close: [];
  save: [settings: DataBarAdvancedSettings];
}>();
const { t } = useAppI18n();
function createDraft() {
  return {
    negativeColor: props.settings.negativeColor ?? "#FF0000",
    negativeBorderColor: props.settings.negativeBorderColor ?? "#FF0000",
    sameFill: props.settings.negativeColor === undefined,
    sameBorder: props.settings.negativeBorderColor === undefined,
    axisPosition: props.settings.axisPosition,
    axisColor: props.settings.axisColor,
  };
}
const draft = reactive(createDraft());

function resetDraft(): void {
  Object.assign(draft, createDraft());
}
function save(): void {
  emit("save", {
    negativeColor: draft.sameFill ? undefined : draft.negativeColor,
    negativeBorderColor: draft.sameBorder ? undefined : draft.negativeBorderColor,
    axisPosition: draft.axisPosition,
    axisColor: draft.axisColor,
  });
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
    :header="t('conditionalFormatting.negativeAndAxisTitle')"
    :confirm-btn="{ content: t('conditionalFormatting.save') }"
    :cancel-btn="t('conditionalFormatting.cancel')"
    :close-on-overlay-click="false"
    width="min(520px, calc(100vw - 32px))"
    placement="center"
    @confirm="save"
    @close="emit('close')"
  >
    <div class="data-bar-advanced-settings">
      <section>
        <h3>{{ t("conditionalFormatting.negativeFillColor") }}</h3>
        <TRadioGroup
          v-model="draft.sameFill"
          direction="vertical"
          :aria-label="t('conditionalFormatting.negativeFillColor')"
        >
          <div class="data-bar-advanced-settings__color-row">
            <TRadio :value="false">{{ t("conditionalFormatting.fillColor") }}</TRadio>
            <div class="data-bar-advanced-settings__color-control">
              <ColorPaletteSelect
                :model-value="draft.negativeColor"
                :label="t('conditionalFormatting.negativeFillColor')"
                default-color="#FF0000"
                :disabled="draft.sameFill"
                @select="draft.negativeColor = $event ?? '#FF0000'"
              />
            </div>
          </div>
          <TRadio :value="true">{{ t("conditionalFormatting.samePositiveFill") }}</TRadio>
        </TRadioGroup>
      </section>
      <section>
        <h3>{{ t("conditionalFormatting.negativeBorderColor") }}</h3>
        <TRadioGroup
          v-model="draft.sameBorder"
          direction="vertical"
          :disabled="!positiveBorderColor"
          :aria-label="t('conditionalFormatting.negativeBorderColor')"
        >
          <div class="data-bar-advanced-settings__color-row">
            <TRadio :value="false">{{ t("conditionalFormatting.borderColor") }}</TRadio>
            <div class="data-bar-advanced-settings__color-control">
              <ColorPaletteSelect
                :model-value="draft.negativeBorderColor"
                :label="t('conditionalFormatting.negativeBorderColor')"
                default-color="#FF0000"
                :disabled="!positiveBorderColor || draft.sameBorder"
                @select="draft.negativeBorderColor = $event ?? '#FF0000'"
              />
            </div>
          </div>
          <TRadio :value="true">{{ t("conditionalFormatting.samePositiveBorder") }}</TRadio>
        </TRadioGroup>
      </section>
      <section>
        <h3>{{ t("conditionalFormatting.axis") }}</h3>
        <p>{{ t("conditionalFormatting.axisDescription") }}</p>
        <TRadioGroup
          v-model="draft.axisPosition"
          direction="vertical"
          :aria-label="t('conditionalFormatting.axisPosition')"
        >
          <TRadio value="automatic">{{ t("conditionalFormatting.axisAutomatic") }}</TRadio>
          <TRadio value="middle">{{ t("conditionalFormatting.axisMiddle") }}</TRadio>
          <TRadio value="none">{{ t("conditionalFormatting.axisNone") }}</TRadio>
        </TRadioGroup>
        <div class="data-bar-advanced-settings__color-row">
          <span>{{ t("conditionalFormatting.axisColor") }}</span>
          <div class="data-bar-advanced-settings__color-control">
            <ColorPaletteSelect
              :model-value="draft.axisColor"
              :label="t('conditionalFormatting.axisColor')"
              default-color="#000000"
              :disabled="draft.axisPosition === 'none'"
              @select="draft.axisColor = $event ?? '#000000'"
            />
          </div>
        </div>
      </section>
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.data-bar-advanced-settings {
  display: grid;
  gap: 16px;

  section {
    display: grid;
    gap: 8px;
  }

  h3 {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 0;
    font-size: var(--idea-font-size-body-medium);
    line-height: var(--idea-line-height-body-medium);
    font-weight: var(--idea-font-weight-semibold);
    &::after {
      content: "";
      flex: 1;
      border-top: 1px solid var(--idea-border-subtle);
    }
  }

  p {
    margin: 0;
  }

  &__color-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__color-control {
    width: 100px;
    flex: none;
  }
}
</style>
