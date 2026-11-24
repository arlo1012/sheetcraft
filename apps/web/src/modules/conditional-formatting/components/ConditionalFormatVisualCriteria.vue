<script setup lang="ts">
import { computed } from "vue";
import type {
  ConditionalFormatIconSet,
  SheetConditionalFormatRule,
} from "@sheetcraft/core/conditional-formatting";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { FormItem as TFormItem } from "tdesign-vue-next/es/form";
import { Select as TSelect, Option as TOption } from "tdesign-vue-next/es/select";
import ColorPaletteSelect from "../../../shared/color/ColorPaletteSelect.vue";
import { useAppI18n, type MessageKey } from "../../../shared/i18n";
import { iconSetPresetTiles } from "../conditional-format-presets";
import {
  iconOptionCondition,
  type ConditionalFormatConditionKind,
  type ConditionalFormatEditorDraft,
  type ConditionalFormatThresholdKind,
} from "../conditional-format-editor-draft";
import ConditionalFormatIconRules from "./ConditionalFormatIconRules.vue";
import ConditionalFormatPreview from "./ConditionalFormatPreview.vue";
import ConditionalFormatThresholdField from "./ConditionalFormatThresholdField.vue";

const props = defineProps<{
  draft: ConditionalFormatEditorDraft;
  previewCondition?: SheetConditionalFormatRule["condition"];
  selectValueReference?: (current: string) => Promise<string | undefined>;
}>();

const emit = defineEmits<{
  updateKind: [kind: ConditionalFormatConditionKind];
  setIconSet: [iconSet: ConditionalFormatIconSet];
  setIconThresholdKind: [index: number, kind: ConditionalFormatThresholdKind];
  setIconThresholdValue: [index: number, value: string];
  setIconThresholdInclusive: [index: number, inclusive: boolean];
  setIcon: [index: number, icon: { iconSet: ConditionalFormatIconSet; iconIndex: number } | null];
  openDataBarAdvanced: [];
}>();

const { t } = useAppI18n();
const iconSets = iconSetPresetTiles;

const showVisualOnly = computed({
  get: () => !props.draft.showValue,
  set: (value: boolean) => {
    props.draft.showValue = !value;
  },
});

const visualStyle = computed({
  get: () =>
    props.draft.kind === "colorScale" ? `scale${props.draft.scaleStops}` : props.draft.kind,
  set: (value: string) => {
    if (value === "scale2" || value === "scale3") {
      emit("updateKind", "colorScale");
      props.draft.scaleStops = value === "scale2" ? 2 : 3;
    } else emit("updateKind", value as ConditionalFormatConditionKind);
  },
});

const visualOptions = computed(() => [
  { value: "scale2", label: t("conditionalFormatting.twoColorScale") },
  { value: "scale3", label: t("conditionalFormatting.threeColorScale") },
  { value: "dataBar", label: t("conditionalFormatting.dataBars") },
  { value: "iconSet", label: t("conditionalFormatting.iconSets") },
]);

const iconOptions = computed(() =>
  iconSets.map((value) => ({
    value,
    label: t(`conditionalFormatting.${value}` as MessageKey),
  })),
);
</script>

<template>
  <div class="conditional-format-editor__visual-settings">
    <TFormItem :label="t('conditionalFormatting.formatStyle')">
      <TSelect v-model="visualStyle" :options="visualOptions" />
    </TFormItem>
    <TCheckbox v-if="draft.kind === 'dataBar'" v-model="showVisualOnly">{{
      t("conditionalFormatting.showBarOnly")
    }}</TCheckbox>
    <TButton
      v-if="draft.kind === 'iconSet'"
      variant="outline"
      :aria-pressed="draft.reverse"
      @click="draft.reverse = !draft.reverse"
      >{{ t("conditionalFormatting.reverse") }}</TButton
    >
    <template v-if="draft.kind === 'iconSet'">
      <TFormItem :label="t('conditionalFormatting.iconStyle')">
        <TSelect
          :model-value="draft.iconSet"
          :aria-label="t('conditionalFormatting.iconSet')"
          @update:model-value="emit('setIconSet', $event as ConditionalFormatIconSet)"
        >
          <template #valueDisplay>
            <ConditionalFormatPreview compact :condition="iconOptionCondition(draft.iconSet)" />
          </template>
          <TOption
            v-for="option in iconOptions"
            :key="option.value"
            :value="option.value"
            :label="option.label"
          >
            <ConditionalFormatPreview compact :condition="iconOptionCondition(option.value)" />
          </TOption>
        </TSelect>
      </TFormItem>
      <TCheckbox v-model="showVisualOnly">{{ t("conditionalFormatting.showIconsOnly") }}</TCheckbox>
    </template>
  </div>

  <template v-if="draft.kind === 'dataBar' || draft.kind === 'colorScale'">
    <div
      class="conditional-format-editor__thresholds"
      :class="{
        'has-midpoint': draft.kind === 'colorScale' && draft.scaleStops === 3,
        'is-data-bar': draft.kind === 'dataBar',
      }"
    >
      <div class="conditional-format-editor__row-labels" aria-hidden="true">
        <span></span><span>{{ t("conditionalFormatting.thresholdType") }}</span
        ><span>{{ t("conditionalFormatting.value") }}</span
        ><span v-if="draft.kind === 'colorScale'">{{ t("conditionalFormatting.color") }}</span>
      </div>
      <div
        class="conditional-format-editor__threshold-column"
        role="group"
        :aria-label="t('conditionalFormatting.minimum')"
      >
        <span>{{ t("conditionalFormatting.minimum") }}</span>
        <ConditionalFormatThresholdField
          v-model:kind="draft.minimumKind"
          v-model:value="draft.minimumValue"
          stacked
          :data-bar-bound="draft.kind === 'dataBar' ? 'minimum' : undefined"
          :label="t('conditionalFormatting.minimum')"
          :select-value-reference="selectValueReference"
        />
        <ColorPaletteSelect
          v-if="draft.kind === 'colorScale'"
          :model-value="draft.minColor"
          :label="t('conditionalFormatting.minimum')"
          default-color="#F8696B"
          :default-label="t('conditionalFormatting.automatic')"
          @select="draft.minColor = $event ?? '#F8696B'"
        />
      </div>
      <div
        v-if="draft.kind === 'colorScale' && draft.scaleStops === 3"
        class="conditional-format-editor__threshold-column"
        role="group"
        :aria-label="t('conditionalFormatting.midpoint')"
      >
        <span>{{ t("conditionalFormatting.midpoint") }}</span>
        <ConditionalFormatThresholdField
          v-model:kind="draft.middleKind"
          v-model:value="draft.middleValue"
          stacked
          :label="t('conditionalFormatting.midpoint')"
          :select-value-reference="selectValueReference"
        />
        <ColorPaletteSelect
          :model-value="draft.midColor"
          :label="t('conditionalFormatting.midpoint')"
          default-color="#FFEB84"
          :default-label="t('conditionalFormatting.automatic')"
          @select="draft.midColor = $event ?? '#FFEB84'"
        />
      </div>
      <div
        class="conditional-format-editor__threshold-column"
        role="group"
        :aria-label="t('conditionalFormatting.maximum')"
      >
        <span>{{ t("conditionalFormatting.maximum") }}</span>
        <ConditionalFormatThresholdField
          v-model:kind="draft.maximumKind"
          v-model:value="draft.maximumValue"
          stacked
          :data-bar-bound="draft.kind === 'dataBar' ? 'maximum' : undefined"
          :label="t('conditionalFormatting.maximum')"
          :select-value-reference="selectValueReference"
        />
        <ColorPaletteSelect
          v-if="draft.kind === 'colorScale'"
          :model-value="draft.maxColor"
          :label="t('conditionalFormatting.maximum')"
          default-color="#63BE7B"
          :default-label="t('conditionalFormatting.automatic')"
          @select="draft.maxColor = $event ?? '#63BE7B'"
        />
      </div>
    </div>
    <section v-if="draft.kind === 'dataBar'" class="conditional-format-editor__section">
      <h3>{{ t("conditionalFormatting.barAppearance") }}</h3>
      <div class="conditional-format-editor__bar-appearance">
        <TFormItem label-align="top" :label="t('conditionalFormatting.barFill')">
          <TSelect
            v-model="draft.gradient"
            :aria-label="t('conditionalFormatting.barFill')"
            :options="[
              { value: false, label: t('conditionalFormatting.solid') },
              { value: true, label: t('conditionalFormatting.gradient') },
            ]"
          />
        </TFormItem>
        <TFormItem label-align="top" :label="t('conditionalFormatting.color')">
          <ColorPaletteSelect
            :model-value="draft.barColor"
            :label="t('conditionalFormatting.barColor')"
            default-color="#638EC6"
            :default-label="t('conditionalFormatting.automatic')"
            @select="draft.barColor = $event ?? '#638EC6'"
          />
        </TFormItem>
        <TFormItem label-align="top" :label="t('conditionalFormatting.border')">
          <TSelect
            :model-value="draft.borderColor !== undefined"
            :aria-label="t('conditionalFormatting.border')"
            :options="[
              { value: false, label: t('conditionalFormatting.noBorder') },
              { value: true, label: t('conditionalFormatting.solidBorder') },
            ]"
            @update:model-value="
              draft.borderColor = $event ? (draft.borderColor ?? draft.barColor) : undefined
            "
          />
        </TFormItem>
        <TFormItem label-align="top" :label="t('conditionalFormatting.borderColor')">
          <ColorPaletteSelect
            :model-value="draft.borderColor"
            :label="t('conditionalFormatting.borderColor')"
            :default-color="draft.barColor"
            :default-label="t('conditionalFormatting.sameAsBar')"
            :disabled="draft.borderColor === undefined"
            @select="draft.borderColor = $event ?? draft.barColor"
          />
        </TFormItem>
      </div>
      <div class="conditional-format-editor__bar-actions">
        <TButton variant="outline" @click="emit('openDataBarAdvanced')">{{
          t("conditionalFormatting.negativeAndAxis")
        }}</TButton>
        <TFormItem :label="t('conditionalFormatting.barDirection')">
          <TSelect
            v-model="draft.direction"
            :aria-label="t('conditionalFormatting.barDirection')"
            :options="[
              { value: 'context', label: t('conditionalFormatting.directionContext') },
              {
                value: 'leftToRight',
                label: t('conditionalFormatting.directionLeftToRight'),
              },
              {
                value: 'rightToLeft',
                label: t('conditionalFormatting.directionRightToLeft'),
              },
            ]"
          />
        </TFormItem>
      </div>
    </section>
  </template>

  <ConditionalFormatIconRules
    v-else-if="draft.kind === 'iconSet' && previewCondition?.kind === 'iconSet'"
    :condition="previewCondition"
    :select-value-reference="selectValueReference"
    @update-kind="(index, kind) => emit('setIconThresholdKind', index, kind)"
    @update-value="(index, value) => emit('setIconThresholdValue', index, value)"
    @update-inclusive="(index, inclusive) => emit('setIconThresholdInclusive', index, inclusive)"
    @update-icon="(index, icon) => emit('setIcon', index, icon)"
  />
</template>

<style scoped lang="scss">
.conditional-format-editor {
  &__section {
    display: grid;
    gap: 8px;
    min-width: 0;
  }
  h3 {
    margin: 0;
    font-size: var(--sheetcraft-font-size-body-medium);
    line-height: var(--sheetcraft-line-height-body-medium);
    font-weight: var(--sheetcraft-font-weight-semibold);
  }
  &__visual-settings {
    display: grid;
    grid-template-columns: minmax(0, 320px) auto;
    align-items: center;
    justify-content: start;
    gap: 8px 12px;
    > * {
      min-width: 0;
    }
    > button {
      justify-self: start;
    }
  }
  &__thresholds {
    display: grid;
    grid-template-columns: 80px repeat(2, minmax(0, 1fr));
    gap: 8px;
    &.has-midpoint {
      grid-template-columns: 80px repeat(3, minmax(0, 1fr));
    }
    &.is-data-bar {
      .conditional-format-editor__row-labels {
        grid-template-rows: 20px repeat(2, 28px);
      }
      .conditional-format-editor__threshold-column {
        grid-template-rows: 20px 64px;
      }
    }
  }
  &__row-labels {
    display: grid;
    grid-template-rows: 20px repeat(3, 28px);
    gap: 8px;
    align-items: center;
    text-align: left;
    color: var(--sheetcraft-text-secondary);
  }
  &__threshold-column {
    display: grid;
    grid-template-rows: 20px 64px 28px;
    gap: 8px;
    min-width: 0;
  }
  &__bar-appearance,
  &__bar-actions {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
  }
  &__bar-actions {
    align-items: center;
    > :last-child {
      grid-column: span 3;
      min-width: 0;
    }
  }
  @media (max-width: 560px) {
    &__visual-settings {
      grid-template-columns: minmax(0, 1fr);
    }
    &__bar-appearance {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    &__bar-actions {
      grid-template-columns: 1fr;
      > :last-child {
        grid-column: auto;
      }
    }
  }
}
</style>
