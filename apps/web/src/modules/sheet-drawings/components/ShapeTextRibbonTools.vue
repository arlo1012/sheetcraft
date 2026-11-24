<script setup lang="ts">
import { getShapeTextCharacterSegments } from "@sheetcraft/core/shape-text-character-runs";
import {
  drawingShapeTextBaseCharacterFormat,
  drawingShapeTextCharacterSource,
} from "../shape-text-options";
import { shapeRichTextSourceStyle } from "../shape-rich-text-source-style";
import { useWorkbookTheme } from "../../../shared/color/workbook-theme-context";
import { computed, nextTick } from "vue";
import { PaintBucket, PencilLine, Sparkles, Type, WrapText, CaseSensitive } from "lucide-vue-next";
import RibbonToolbar from "../../../shared/ribbon/RibbonToolbar.vue";
import RibbonButton from "../../../shared/ribbon/RibbonButton.vue";
import RibbonColorSplitButton from "../../../shared/color/RibbonColorSplitButton.vue";
import TextAlignmentToggleGroup, {
  type TextAlignmentOption,
} from "../../../shared/text-format/TextAlignmentToggleGroup.vue";
import TextStyleToggleGroup, {
  type TextStyleToggleItem,
  type TextStyleToggleKey,
} from "../../../shared/text-format/TextStyleToggleGroup.vue";
import ShapeFontFamilyField from "./ShapeFontFamilyField.vue";
import ShapeRibbonFontSizeField from "./ShapeRibbonFontSizeField.vue";
import ShapeObjectToolControls from "./ShapeObjectToolControls.vue";
import ShapeRibbonLayoutMenu from "./ShapeRibbonLayoutMenu.vue";
import ShapeRibbonStyleMenu from "./ShapeRibbonStyleMenu.vue";
import { getShapeAlignmentOptions } from "./shape-format/shape-alignment-options";
import { useShapeFormatPane, type ShapeFormatPaneInput } from "./shape-format/useShapeFormatPane";
import type {
  ShapeFormatBooleanField,
  ShapeFormatField,
  ShapeFormatValues,
} from "../shape-format-pane-model";
import type { ShapeObjectToolsInput } from "../shape-object-controls-contract";
import { focusShapeTextEditInput } from "../shape-text-edit-ownership";
const props = defineProps<
  ShapeFormatPaneInput & {
    sessionId?: number;
    mode: "drawing" | "text";
    objectTools?: ShapeObjectToolsInput;
  }
>();
const c = useShapeFormatPane(props);
const theme = useWorkbookTheme();
const chinese = computed(() => props.locale === "zh-CN");
const label = (en: string, zh: string) => (chinese.value ? zh : en);
function pressed(field: ShapeFormatBooleanField): boolean | "mixed" {
  return c.isMixedField(field) ? "mixed" : props.snapshot?.values[field] === true;
}
function restore(): void {
  const owner = props.sessionId;
  if (owner !== undefined) void nextTick(() => focusShapeTextEditInput(owner));
}
function change<K extends ShapeFormatField>(field: K, value: ShapeFormatValues[K]): void {
  if (c.session.fieldAction(field)(value)) restore();
}
function toggle(field: ShapeFormatBooleanField): void {
  change(field, props.snapshot?.values[field] !== true);
}
const styleFieldByKey: Record<TextStyleToggleKey, ShapeFormatBooleanField> = {
  bold: "textBold",
  italic: "textItalic",
  underline: "textUnderline",
  strike: "textStrike",
};
const styleItems = computed<readonly TextStyleToggleItem[]>(() =>
  (["bold", "italic", "underline", "strike"] as const).map((key) => {
    const field = styleFieldByKey[key];
    return {
      key,
      label: c.s.value(field),
      pressed: pressed(field),
      disabled: !c.fieldCapability(field).enabled,
      actionAttr: key,
    };
  }),
);
function toggleStyle(key: TextStyleToggleKey): void {
  toggle(styleFieldByKey[key]);
}
const horizontalAlignmentOptions = computed<readonly TextAlignmentOption[]>(() => [
  { value: "left", label: label("Align Left", "左对齐"), icon: "left", actionAttr: "align-left" },
  {
    value: "center",
    label: label("Center", "居中"),
    icon: "center",
    actionAttr: "align-center",
  },
  {
    value: "right",
    label: label("Align Right", "右对齐"),
    icon: "right",
    actionAttr: "align-right",
  },
  { value: "justify", label: label("Justify", "两端对齐"), icon: "justify" },
]);
const verticalAlignmentOptions = computed(() =>
  getShapeAlignmentOptions(c, "textVerticalAlignment"),
);
const textColor = computed(() => c.session.fieldAction("textColor"));
const sourceNote = computed(() => {
  if (props.sessionId === undefined) return undefined;
  const drawing = props.snapshot?.drawing;
  const approximate =
    drawing &&
    (drawing.kind === "shape" || drawing.kind === "textBox") &&
    (drawing.shapeText?.warp ||
      getShapeTextCharacterSegments(
        drawingShapeTextCharacterSource(drawing),
        drawingShapeTextBaseCharacterFormat(drawing),
      ).some((format) => shapeRichTextSourceStyle(format, theme?.value).previewDiffers));
  return approximate
    ? label(
        "Editing source text; full effects are preserved when you finish.",
        "正在编辑源文字；结束编辑后保留完整效果。",
      )
    : undefined;
});
</script>
<template>
  <div class="shape-text-ribbon" :data-shape-text-edit-session="sessionId" data-shape-text-ribbon>
    <RibbonToolbar
      :label="
        label(
          mode === 'drawing' ? 'Drawing Tools' : 'Text Tools',
          mode === 'drawing' ? '绘图工具' : '文本工具',
        )
      "
    >
      <section
        v-if="mode === 'text'"
        class="shape-text-ribbon__compact"
        data-ribbon-group="shape-font"
        :aria-label="c.s.value('font')"
      >
        <div class="shape-text-ribbon__row">
          <div class="shape-text-ribbon__family">
            <ShapeFontFamilyField
              feedback-presentation="floating"
              :controller="c"
              :session-id="sessionId"
            />
          </div>
          <div class="shape-text-ribbon__size">
            <ShapeRibbonFontSizeField :controller="c" :session-id="sessionId" />
          </div>
        </div>
        <div class="shape-text-ribbon__row">
          <TextStyleToggleGroup
            variant="ribbon"
            :items="styleItems"
            :label="c.s.value('textStyle')"
            @toggle="toggleStyle"
          />
          <div class="shape-text-ribbon__color">
            <RibbonColorSplitButton
              kind="text"
              :model-value="snapshot?.values.textColor || null"
              :mixed="c.isMixedField('textColor')"
              :label="c.s.value('textColor')"
              :disabled="!c.fieldCapability('textColor').enabled"
              :session-id="sessionId"
              @select="
                (value) => {
                  if (textColor(value ?? '')) restore();
                }
              "
            />
          </div>
        </div>
      </section>
      <section
        v-if="mode === 'text'"
        class="shape-text-ribbon__compact"
        data-ribbon-group="shape-paragraph"
        :aria-label="c.s.value('paragraph')"
      >
        <div class="shape-text-ribbon__row">
          <TextAlignmentToggleGroup
            variant="ribbon"
            :options="horizontalAlignmentOptions"
            :model-value="snapshot?.values.paragraphAlignment"
            :mixed="c.isMixedField('paragraphAlignment')"
            :disabled="!c.fieldCapability('paragraphAlignment').enabled"
            :label="c.s.value('paragraphAlignment')"
            @select="
              (value) =>
                change('paragraphAlignment', value as ShapeFormatValues['paragraphAlignment'])
            "
          />
        </div>
        <div class="shape-text-ribbon__row">
          <TextAlignmentToggleGroup
            variant="ribbon"
            :options="verticalAlignmentOptions"
            :model-value="snapshot?.values.textVerticalAlignment"
            :mixed="c.isMixedField('textVerticalAlignment')"
            :disabled="!c.fieldCapability('textVerticalAlignment').enabled"
            :label="c.s.value('textVerticalAlignment')"
            @select="
              (value) =>
                change('textVerticalAlignment', value as ShapeFormatValues['textVerticalAlignment'])
            "
          />
          <RibbonButton
            :label="c.s.value('textWrap')"
            :pressed="pressed('textWrap')"
            :disabled="!c.fieldCapability('textWrap').enabled"
            @activate="toggle('textWrap')"
            ><WrapText
          /></RibbonButton>
          <ShapeRibbonLayoutMenu :controller="c" :session-id="sessionId"
            ><CaseSensitive
          /></ShapeRibbonLayoutMenu>
        </div>
      </section>
      <section
        class="shape-text-ribbon__compact"
        data-ribbon-group="shape-text-appearance"
        :aria-label="label('Text Appearance', '文字外观')"
      >
        <div class="shape-text-ribbon__row">
          <ShapeRibbonStyleMenu
            :controller="c"
            target="text"
            category="fill"
            :label="label('Text Fill', '文字填充')"
            :session-id="sessionId"
            ><PaintBucket
          /></ShapeRibbonStyleMenu>
          <ShapeRibbonStyleMenu
            :controller="c"
            target="text"
            category="line"
            :label="label('Text Outline', '文字轮廓')"
            :session-id="sessionId"
            ><PencilLine
          /></ShapeRibbonStyleMenu>
        </div>
        <div class="shape-text-ribbon__row">
          <ShapeRibbonStyleMenu
            :controller="c"
            target="text"
            category="effects"
            :label="label('Text Effects', '文字效果')"
            :session-id="sessionId"
            ><Sparkles
          /></ShapeRibbonStyleMenu>
          <ShapeRibbonStyleMenu
            :controller="c"
            target="text"
            category="styles"
            :label="label('WordArt Styles', '艺术字样式')"
            :session-id="sessionId"
            ><Type
          /></ShapeRibbonStyleMenu>
        </div>
      </section>
      <section
        class="shape-text-ribbon__compact"
        data-ribbon-group="shape-appearance"
        :aria-label="label('Shape Appearance', '形状外观')"
      >
        <ShapeRibbonStyleMenu
          :controller="c"
          target="shape"
          category="fill"
          :label="label('Shape Fill', '形状填充')"
          :session-id="sessionId"
          ><PaintBucket
        /></ShapeRibbonStyleMenu>
        <ShapeRibbonStyleMenu
          :controller="c"
          target="shape"
          category="line"
          :label="label('Shape Outline', '形状轮廓')"
          :session-id="sessionId"
          ><PencilLine
        /></ShapeRibbonStyleMenu>
      </section>
      <ShapeObjectToolControls v-if="mode === 'drawing' && objectTools" v-bind="objectTools" />
    </RibbonToolbar>
    <p v-if="c.error.value" class="shape-text-ribbon__status" role="alert">
      {{ c.error.value }}
    </p>
    <p v-else-if="sourceNote" class="shape-text-ribbon__status" role="status">{{ sourceNote }}</p>
  </div>
</template>
<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;
.shape-text-ribbon {
  min-width: 0;
  &__compact {
    @include ribbon.compact;
  }
  &__row {
    @include ribbon.row;
  }
  &__family {
    width: 145px;
  }
  &__size {
    width: 56px;
    min-width: 56px;
    flex-shrink: 0;
  }
  &__color {
    width: auto;
    flex-shrink: 0;
  }
  &__status {
    margin: 0 8px;
    color: var(--sheetcraft-text-secondary);
    font-size: 12px;
    line-height: 18px;
  }
}
</style>
