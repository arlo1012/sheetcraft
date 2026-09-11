<script setup lang="ts">
import { computed } from "vue";
import { AutoComplete as TAutoComplete } from "tdesign-vue-next/es/auto-complete";
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
import CellFormatFontColorControl from "./CellFormatFontColorControl.vue";

const props = defineProps<{
  state: SelectionCellStyleState;
  patch: CellStylePatch;
  sampleValue: string | number | boolean | null;
}>();
const emit = defineEmits<{ "update:patch": [patch: CellStylePatch] }>();
const { t } = useAppI18n();
const {
  familyInput,
  familyMixed,
  familyOptions,
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
  updateFontStyleInput,
  selectFontStyle,
  commitFontStyleInput,
  setUnderline,
  setStrikethrough,
  setScript,
  setColor,
} = useFontFormatPanel(props, (patch) => emit("update:patch", patch));
const fontPopupStyle = { maxHeight: "200px", overflow: "auto" as const };
// Commit free text after the popup closes, so input blur cannot replace an
// option between its mousedown and click events.
const familyPopupProps = {
  overlayInnerStyle: fontPopupStyle,
  onVisibleChange: (visible: boolean) => {
    if (!visible) commitFamilyInput();
  },
};
const stylePopupProps = {
  overlayInnerStyle: fontPopupStyle,
  onVisibleChange: (visible: boolean) => {
    if (!visible) commitFontStyleInput();
  },
};
const sizePopupProps = {
  overlayInnerStyle: fontPopupStyle,
  onVisibleChange: (visible: boolean) => {
    if (!visible) commitSizeInput();
  },
};
const previewText = computed(() =>
  props.sampleValue === null || props.sampleValue === ""
    ? t("cellFormat.fontPreviewText")
    : String(props.sampleValue),
);
</script>

<template>
  <section class="cell-format-font" :aria-label="t('cellFormat.font')">
    <div class="cell-format-font__lists">
      <label class="cell-format-font__field">
        <span>{{ t("format.fontFamily") }}</span>
        <TAutoComplete
          :model-value="familyInput"
          :options="familyOptions"
          :input-props="{ maxlength: 80 }"
          :popup-props="familyPopupProps"
          :placeholder="familyMixed ? t('format.mixed') : undefined"
          filterable
          clearable
          data-cell-format-font-family
          @change="updateFamilyInput"
          @select="setFamily"
          @enter="commitFamilyInput"
        />
      </label>
      <label class="cell-format-font__field">
        <span>{{ t("cellFormat.fontStyle") }}</span>
        <TAutoComplete
          :model-value="fontStyleInput"
          :options="styleOptions"
          :popup-props="stylePopupProps"
          :placeholder="fontStyle === undefined ? t('format.mixed') : undefined"
          filterable
          clearable
          data-cell-format-font-style
          @change="updateFontStyleInput"
          @select="selectFontStyle"
          @enter="commitFontStyleInput"
        />
      </label>
      <label class="cell-format-font__field">
        <span>{{ t("format.fontSize") }}</span>
        <TAutoComplete
          :model-value="sizeInput"
          :options="sizeOptions"
          :popup-props="sizePopupProps"
          :placeholder="sizeMixed ? t('format.mixed') : undefined"
          filterable
          clearable
          data-cell-format-font-size
          @change="updateSizeInput"
          @select="setSize"
          @enter="commitSizeInput"
        />
      </label>
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
        <CellFormatFontColorControl :model-value="color" :mixed="colorMixed" @select="setColor" />
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
          <span class="cell-format-font__preview-rule" aria-hidden="true" />
          <span
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
  &__bottom {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr);
    gap: 16px;
    align-items: start;
  }
  &__effects,
  &__preview-group {
    display: grid;
    gap: 4px;
    min-width: 0;
  }
  &__preview {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    min-height: 72px;
    overflow: auto;
    padding: 12px 8px;
    border: 1px solid var(--idea-border-subtle);
    border-radius: var(--idea-radius-default);
    background: var(--idea-surface-panel);
    line-height: normal;
    white-space: pre;
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
    &__appearance,
    &__bottom {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
}
</style>
