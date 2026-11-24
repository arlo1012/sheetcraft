<script setup lang="ts">
import { getShapeTextCharacterSegments } from "@sheetcraft/core/shape-text-character-runs";
import {
  drawingShapeTextBaseCharacterFormat,
  drawingShapeTextCharacterSource,
} from "../shape-text-options";
import { shapeRichTextSourceStyle } from "../shape-rich-text-source-style";
import { useWorkbookTheme } from "../../../shared/color/workbook-theme-context";
import { computed, nextTick } from "vue";
import { PaintBucket, PencilLine, Sparkles, TextWrap, Type } from "lucide-vue-next";
import RibbonToolbar from "../../../shared/ribbon/RibbonToolbar.vue";
import RibbonButton from "../../../shared/ribbon/RibbonButton.vue";
import RibbonColorSplitButton from "../../../shared/color/RibbonColorSplitButton.vue";
import TextAlignmentToggleGroup, {
  type TextAlignmentOption,
} from "../../../shared/text-format/TextAlignmentToggleGroup.vue";
import TextDirectionIcon from "../../../shared/text-format/TextDirectionIcon.vue";
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
  { value: "left", label: c.s.value("alignLeft"), icon: "left", actionAttr: "align-left" },
  {
    value: "center",
    label: c.s.value("center"),
    icon: "center",
    actionAttr: "align-center",
  },
  {
    value: "right",
    label: c.s.value("alignRight"),
    icon: "right",
    actionAttr: "align-right",
  },
  { value: "justify", label: c.s.value("justify"), icon: "justify" },
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
  return approximate ? c.s.value("sourceTextEditingNote") : undefined;
});
</script>
<template>
  <div class="shape-text-ribbon" :data-shape-text-edit-session="sessionId" data-shape-text-ribbon>
    <RibbonToolbar :label="c.s.value(mode === 'drawing' ? 'drawingTools' : 'textTools')">
      <section
        v-if="mode === 'text'"
        class="shape-text-ribbon__compact shape-text-ribbon__font"
        data-ribbon-group="shape-font"
        :aria-label="c.s.value('font')"
      >
        <div class="shape-text-ribbon__row shape-text-ribbon__font-row" data-ribbon-row="1">
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
        <div class="shape-text-ribbon__row shape-text-ribbon__font-row" data-ribbon-row="2">
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
        class="shape-text-ribbon__compact shape-text-ribbon__grid-group"
        data-ribbon-group="shape-paragraph"
        :aria-label="c.s.value('paragraph')"
      >
        <div class="shape-text-ribbon__grid-row" data-ribbon-row="1">
          <div class="shape-text-ribbon__leading">
            <TextAlignmentToggleGroup
              variant="ribbon"
              :options="verticalAlignmentOptions"
              :model-value="snapshot?.values.textVerticalAlignment"
              :mixed="c.isMixedField('textVerticalAlignment')"
              :disabled="!c.fieldCapability('textVerticalAlignment').enabled"
              :label="c.s.value('textVerticalAlignment')"
              @select="
                (value) =>
                  change(
                    'textVerticalAlignment',
                    value as ShapeFormatValues['textVerticalAlignment'],
                  )
              "
            />
          </div>
          <div class="shape-text-ribbon__action">
            <RibbonButton
              full-width
              :label="c.s.value('textWrap')"
              :text="c.s.value('textWrapShort')"
              :pressed="pressed('textWrap')"
              :disabled="!c.fieldCapability('textWrap').enabled"
              @activate="toggle('textWrap')"
              ><TextWrap aria-hidden="true"
            /></RibbonButton>
          </div>
        </div>
        <div class="shape-text-ribbon__grid-row" data-ribbon-row="2">
          <div class="shape-text-ribbon__leading">
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
          <div class="shape-text-ribbon__action">
            <ShapeRibbonLayoutMenu full-width :controller="c" :session-id="sessionId"
              ><TextDirectionIcon
            /></ShapeRibbonLayoutMenu>
          </div>
        </div>
      </section>
      <section
        class="shape-text-ribbon__compact shape-text-ribbon__grid-group"
        data-ribbon-group="shape-text-appearance"
        :aria-label="c.s.value('textAppearance')"
      >
        <div class="shape-text-ribbon__grid-row" data-ribbon-row="1">
          <div class="shape-text-ribbon__action">
            <ShapeRibbonStyleMenu
              full-width
              :controller="c"
              target="text"
              category="fill"
              :label="c.s.value('textFill')"
              :session-id="sessionId"
              ><PaintBucket
            /></ShapeRibbonStyleMenu>
          </div>
          <div class="shape-text-ribbon__action">
            <ShapeRibbonStyleMenu
              full-width
              :controller="c"
              target="text"
              category="line"
              :label="c.s.value('textOutline')"
              :session-id="sessionId"
              ><PencilLine
            /></ShapeRibbonStyleMenu>
          </div>
        </div>
        <div class="shape-text-ribbon__grid-row" data-ribbon-row="2">
          <div class="shape-text-ribbon__action">
            <ShapeRibbonStyleMenu
              full-width
              :controller="c"
              target="text"
              category="effects"
              :label="c.s.value('textEffects')"
              :session-id="sessionId"
              ><Sparkles
            /></ShapeRibbonStyleMenu>
          </div>
          <div class="shape-text-ribbon__action">
            <ShapeRibbonStyleMenu
              full-width
              :controller="c"
              target="text"
              category="styles"
              :label="c.s.value('wordArtStyles')"
              :session-id="sessionId"
              ><Type
            /></ShapeRibbonStyleMenu>
          </div>
        </div>
      </section>
      <section
        class="shape-text-ribbon__compact"
        data-ribbon-group="shape-appearance"
        :aria-label="c.s.value('shapeAppearance')"
      >
        <ShapeRibbonStyleMenu
          full-width
          :controller="c"
          target="shape"
          category="fill"
          :label="c.s.value('shapeFill')"
          :session-id="sessionId"
          ><PaintBucket
        /></ShapeRibbonStyleMenu>
        <ShapeRibbonStyleMenu
          full-width
          :controller="c"
          target="shape"
          category="line"
          :label="c.s.value('shapeOutline')"
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
  &__font {
    --shape-font-family-width: 120px;
    --shape-font-size-width: 48px;
    --shape-font-gap: 4px;
  }
  &__row {
    @include ribbon.row;
  }
  &__font-row {
    gap: var(--shape-font-gap);
  }
  &__grid-group {
    grid-template-columns: max-content max-content;
    column-gap: 4px;
  }
  &__grid-row {
    @include ribbon.row;
    display: grid;
    grid-column: 1 / -1;
    grid-template-columns: subgrid;
    gap: 4px;
  }
  &__leading {
    display: flex;
    align-items: center;
  }
  &__action {
    display: grid;
    min-width: 0;
  }
  &__family {
    display: inline-flex;
    align-items: center;
    width: var(--shape-font-family-width);
    height: var(--ribbon-control-height, 26px);
    min-width: 0;
  }
  &__size {
    display: inline-flex;
    align-items: center;
    width: var(--shape-font-size-width);
    min-width: var(--shape-font-size-width);
    height: var(--ribbon-control-height, 26px);
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
