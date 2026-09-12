<script setup lang="ts">
import { computed } from "vue";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import type { CellStylePatch } from "@idea10/core/style";
import type { SelectionCellStyleState } from "@idea10/core/style-state";
import {
  getCellTextTypographyStyle,
  getCellTextScriptStyle,
  getCellTextUnderlineStyle,
  getCellTextStrikethroughStyle,
} from "../../../shared/cell-text/font-presentation";
import { useAppI18n } from "../../../shared/i18n";
import { useFontFormatPanel } from "../font/useFontFormatPanel";
import OptionList from "../../../shared/option-list/OptionList.vue";
import CellFormatColorControl from "./CellFormatColorControl.vue";

const props = defineProps<{
  state: SelectionCellStyleState;
  patch: CellStylePatch;
  sampleValue: string | number | boolean | null;
}>();
const emit = defineEmits<{ "update:patch": [patch: CellStylePatch] }>();
const { t } = useAppI18n();
const {
  family,
  familyInput,
  familyMixed,
  familyOptions,
  size,
  sizeInput,
  sizeMixed,
  sizeOptions,
  fontStyle,
  fontStyleInput,
  styleOptions,
  underline,
  underlineOptions,
  color,
  colorMixed,
  script,
  scriptMixed,
  strikethrough,
  previewStyle,
  setFamily,
  updateFamilyInput,
  commitFamilyInput,
  setSize,
  updateSizeInput,
  commitSizeInput,
  setFontStyle,
  updateFontStyleInput,
  commitFontStyleInput,
  setUnderline,
  setStrikethrough,
  setScript,
  setColor,
} = useFontFormatPanel(props, (patch) => emit("update:patch", patch));
const familyListOptions = computed(() =>
  familyOptions.value.map(({ code, ...option }) => ({ ...option, value: code })),
);
const styleListOptions = computed(() =>
  styleOptions.value.map(({ code, ...option }) => ({ ...option, value: code })),
);
const sizeListOptions = computed(() =>
  sizeOptions.value.map(({ code, ...option }) => ({ ...option, value: code })),
);
const previewText = computed(() =>
  props.sampleValue === null || props.sampleValue === ""
    ? t("cellFormat.fontPreviewText")
    : String(props.sampleValue),
);
</script>

<template>
  <section class="cell-format-font" :aria-label="t('cellFormat.font')">
    <div class="cell-format-font__lists">
      <div class="cell-format-font__field" role="group" :aria-label="t('format.fontFamily')">
        <span>{{ t("format.fontFamily") }}</span>
        <TInput
          :model-value="familyInput"
          :aria-label="t('format.fontFamily')"
          :placeholder="familyMixed ? t('format.mixed') : undefined"
          :maxlength="80"
          clearable
          data-cell-format-font-family
          @change="updateFamilyInput"
          @blur="commitFamilyInput"
          @enter="commitFamilyInput"
        />
        <OptionList
          class="cell-format-font__list"
          :model-value="family"
          :search-text="familyInput"
          :options="familyListOptions"
          :label="t('format.fontFamily')"
          data-cell-format-font-family-list
          @select="setFamily"
        >
          <template #option="{ option }"
            ><span :style="{ fontFamily: option.value }">{{ option.label }}</span></template
          >
        </OptionList>
      </div>
      <div class="cell-format-font__field" role="group" :aria-label="t('cellFormat.fontStyle')">
        <span>{{ t("cellFormat.fontStyle") }}</span>
        <TInput
          :model-value="fontStyleInput"
          :aria-label="t('cellFormat.fontStyle')"
          :placeholder="fontStyle === undefined ? t('format.mixed') : undefined"
          clearable
          data-cell-format-font-style
          @change="updateFontStyleInput"
          @blur="commitFontStyleInput"
          @enter="commitFontStyleInput"
        />
        <OptionList
          class="cell-format-font__list"
          :model-value="fontStyle"
          :search-text="fontStyleInput"
          :options="styleListOptions"
          :label="t('cellFormat.fontStyle')"
          data-cell-format-font-style-list
          @select="setFontStyle"
        >
          <template #option="{ option }"
            ><span
              :style="{
                fontWeight: option.value === 'bold' || option.value === 'boldItalic' ? 700 : 400,
                fontStyle:
                  option.value === 'italic' || option.value === 'boldItalic' ? 'italic' : 'normal',
              }"
              >{{ option.label }}</span
            ></template
          >
        </OptionList>
      </div>
      <div class="cell-format-font__field" role="group" :aria-label="t('format.fontSize')">
        <span>{{ t("format.fontSize") }}</span>
        <TInput
          :model-value="sizeInput"
          :aria-label="t('format.fontSize')"
          :placeholder="sizeMixed ? t('format.mixed') : undefined"
          inputmode="numeric"
          clearable
          data-cell-format-font-size
          @change="updateSizeInput"
          @blur="commitSizeInput"
          @enter="commitSizeInput"
        />
        <OptionList
          class="cell-format-font__list"
          :model-value="size === undefined ? undefined : String(size)"
          :search-text="sizeInput"
          :options="sizeListOptions"
          :label="t('format.fontSize')"
          data-cell-format-font-size-list
          @select="setSize"
        />
      </div>
    </div>
    <div class="cell-format-font__appearance">
      <div class="cell-format-font__field" role="group" :aria-label="t('format.underline')">
        <span>{{ t("format.underline") }}</span>
        <TSelect
          :model-value="underline"
          :options="underlineOptions"
          :placeholder="underline === undefined ? t('format.mixed') : undefined"
          :aria-label="t('format.underline')"
          data-cell-format-underline
          @change="setUnderline"
        />
      </div>
      <div class="cell-format-font__field" role="group" :aria-label="t('format.textColor')">
        <span>{{ t("format.textColor") }}</span>
        <CellFormatColorControl
          :model-value="color"
          :mixed="colorMixed"
          :label="t('format.textColor')"
          default-color="#20242c"
          data-cell-format-font-color
          @select="setColor"
        />
      </div>
    </div>
    <div class="cell-format-font__bottom">
      <div class="cell-format-font__effects" role="group" :aria-label="t('cellFormat.fontEffects')">
        <h3>{{ t("cellFormat.fontEffects") }}</h3>
        <TCheckbox
          :checked="strikethrough === 'on'"
          :indeterminate="strikethrough === 'mixed'"
          data-cell-format-strikethrough
          @change="setStrikethrough"
          >{{ t("ribbon.strikethrough") }}</TCheckbox
        >
        <TCheckbox
          :checked="script === 'superscript'"
          :indeterminate="scriptMixed"
          data-cell-format-superscript
          @change="setScript('superscript', $event)"
          >{{ t("cellFormat.superscript") }}</TCheckbox
        >
        <TCheckbox
          :checked="script === 'subscript'"
          :indeterminate="scriptMixed"
          data-cell-format-subscript
          @change="setScript('subscript', $event)"
          >{{ t("cellFormat.subscript") }}</TCheckbox
        >
      </div>
      <div class="cell-format-font__preview-group">
        <h3>{{ t("cellFormat.preview") }}</h3>
        <div class="cell-format-font__preview" :aria-label="t('cellFormat.preview')">
          <div class="cell-format-font__preview-content">
            <span class="cell-format-font__preview-rule" aria-hidden="true" />
            <span
              class="cell-format-font__preview-text"
              :style="{
                ...getCellTextTypographyStyle(previewStyle, { includeDecorations: false }),
                ...getCellTextScriptStyle(previewStyle),
                ...getCellTextUnderlineStyle(previewStyle),
              }"
              data-cell-format-font-preview
              ><span :style="getCellTextStrikethroughStyle(previewStyle)">{{
                previewText
              }}</span></span
            >
            <span class="cell-format-font__preview-rule" aria-hidden="true" />
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.cell-format-font {
  display: grid;
  gap: 16px;
  padding: 16px 0 4px;
  color: var(--idea-text-primary);
  font-size: var(--idea-font-size-body-medium);
  line-height: var(--idea-line-height-body-medium);

  h3 {
    margin: 0;
    font-size: inherit;
    font-weight: var(--idea-font-weight-semibold);
  }
  &__lists,
  &__appearance {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }
  &__field {
    display: grid;
    align-content: start;
    gap: 4px;
    min-width: 0;
  }
  &__list {
    height: 160px;
  }
  &__bottom {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    align-items: start;
  }
  &__effects,
  &__preview-group {
    display: grid;
    gap: 4px;
    min-width: 0;
  }
  &__preview-group {
    grid-column: span 2;
  }
  &__preview {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    height: 72px;
    overflow: hidden;
    padding: 12px 8px;
    border: 1px solid var(--idea-border-subtle);
    border-radius: var(--idea-radius-default);
    background: var(--idea-surface-panel);
    line-height: normal;
    white-space: pre;
  }
  &__preview-content {
    display: flex;
    flex: none;
    align-items: baseline;
    gap: 12px;
    width: max-content;
    min-width: 100%;
  }
  &__preview-text {
    flex: none;
  }
  &__preview-rule {
    flex: 1 0 16px;
    border-top: 1px solid var(--idea-text-primary);
  }
}
@media (max-width: 480px) {
  .cell-format-font {
    &__lists {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      > :first-child {
        grid-column: 1 / -1;
      }
    }
    &__appearance {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    &__bottom {
      grid-template-columns: minmax(0, 1fr);
    }
    &__preview-group {
      grid-column: auto;
    }
  }
}
</style>
