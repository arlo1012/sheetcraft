<script setup lang="ts">
import {
  computed,
  onUnmounted,
  ref,
  watch,
  type DirectiveBinding,
  type ObjectDirective,
} from "vue";
import ColorPaletteSelect from "../../../../shared/color/ColorPaletteSelect.vue";
import FontFormatField from "../../../home-tools/components/FontFormatField.vue";
import { useFontCatalog } from "../../../../shared/cell-text/useFontCatalog";
import { resolveFontFamilyName } from "../../../../shared/cell-text/font-catalog";
import {
  ensureCellFontResource,
  getCellFontResourceFamilies,
} from "../../../../shared/cell-text/font-resources";
import FontSettingsAction from "../../../../shared/cell-text/FontSettingsAction.vue";
import PictureFormatSection from "../../../sheet-images/components/format-pane/PictureFormatSection.vue";
import PictureFormatField from "../../../sheet-images/components/format-pane/PictureFormatField.vue";
import ShapeFormatNumberField from "./ShapeFormatNumberField.vue";
import ShapeFormatCheckbox from "./ShapeFormatCheckbox.vue";
import ShapeFormatChoiceField from "./ShapeFormatChoiceField.vue";
import type { ShapeFormatController } from "./useShapeFormatPane";
const props = defineProps<{ controller: ShapeFormatController }>();
const fieldRoot = ref<HTMLElement>();
const colorAction = computed(() => props.controller.session.fieldAction("textColor"));
const family = computed(() =>
  props.controller.isMixedField("fontFamily")
    ? undefined
    : props.controller.props.snapshot?.values.fontFamily,
);
const draft = ref(family.value),
  dirty = ref(false),
  error = ref<string>();
let request = 0;
// FontFormatField owns its inner input. Attach the shape-specific mixed placeholder
// to that input without turning the placeholder into a selected font family.
function fontPlaceholder(element: HTMLElement, binding: DirectiveBinding<string | undefined>) {
  element.querySelector("input")?.setAttribute("placeholder", binding.value ?? "");
}
const vFontPlaceholder: ObjectDirective<HTMLElement, string | undefined> = {
  mounted: fontPlaceholder,
  updated: fontPlaceholder,
};
watch(
  () => props.controller.ownerKey.value,
  () => {
    request++;
    draft.value = family.value;
    dirty.value = false;
    error.value = undefined;
  },
);
onUnmounted(() => request++);
watch(family, (value) => {
  if (!dirty.value) draft.value = value;
});
const { fontOptions } = useFontCatalog(() =>
  [family.value, draft.value].filter((value): value is string => !!value),
);
const options = computed(() => [
  { label: props.controller.s.value("fontInherited"), value: "" },
  ...fontOptions.value.map(({ label, value, aliases }) => ({
    label,
    value,
    aliases,
    fontFamily: value,
  })),
]);
const capability = computed(() => props.controller.fieldCapability("fontFamily"));
const action = computed(() => {
  // Both callbacks belong to this exact rendered owner and field action. Never
  // recreate an action after awaiting a resource, which could retarget an edit.
  const session = props.controller.session,
    token = session.capture(),
    apply = session.fieldAction("fontFamily");
  return (value: string | number) => {
    if (typeof value !== "string" || !capability.value.enabled || !session.current(token)) return;
    const trimmed = value.trim();
    const next = options.value.some((option) => option.value === trimmed)
      ? trimmed
      : resolveFontFamilyName(trimmed);
    const attempt = ++request;
    draft.value = next;
    dirty.value = true;
    error.value = undefined;
    const commit = () => {
      if (attempt !== request) return;
      if (!session.current(token)) {
        error.value = props.controller.s.value("staleOwner");
        return;
      }
      const accepted = apply(next);
      if (attempt !== request) return;
      if (accepted) {
        dirty.value = false;
        error.value = undefined;
      } else error.value = props.controller.s.value("applyRejected");
    };
    const resources = getCellFontResourceFamilies(next);
    if (!resources.length) {
      commit();
      return;
    }
    // Loading is preparatory work, never an accepted document edit. Failed
    // exact resources keep the draft rather than choosing another font family.
    return Promise.all(resources.map((family) => ensureCellFontResource(family))).then(
      commit,
      () => {
        if (attempt === request && session.current(token))
          error.value = props.controller.s.value("fontLoadFailed");
      },
    );
  };
});
function escape(event: KeyboardEvent) {
  if (event.key === "Escape" && dirty.value) {
    event.preventDefault();
    event.stopPropagation();
    request++;
    draft.value = family.value;
    dirty.value = false;
    error.value = undefined;
  }
}
</script>
<template>
  <div ref="fieldRoot" class="shape-format-font-fields">
    <PictureFormatSection :title="controller.s.value('font')" initially-open>
      <PictureFormatField
        :label="controller.s.value('fontFamily')"
        :reason="capability.enabled ? undefined : capability.reason"
        :error="error"
        data-shape-format-field="fontFamily"
      >
        <div @keydown.capture="escape">
          <FontFormatField
            v-font-placeholder="
              !dirty && controller.isMixedField('fontFamily')
                ? controller.s.value('mixedValues')
                : undefined
            "
            :model-value="draft"
            :popup-attach="() => fieldRoot!"
            :options="options"
            :label="controller.s.value('fontFamily')"
            :search-label="controller.s.value('fontSearch')"
            :empty-label="controller.s.value('fontEmpty')"
            :disabled="!capability.enabled"
            :onChange="action"
            ><template #searchAction="{ close }"><FontSettingsAction @open="close" /></template
          ></FontFormatField>
        </div>
      </PictureFormatField>
      <ShapeFormatNumberField :controller="controller" field="fontSizePt" />
      <PictureFormatField
        :label="controller.s.value('textColor')"
        data-shape-format-field="textColor"
      >
        <ColorPaletteSelect
          :model-value="controller.props.snapshot?.values.textColor || null"
          :mixed="controller.isMixedField('textColor')"
          :label="controller.s.value('textColor')"
          :disabled="!controller.fieldCapability('textColor').enabled"
          show-value
          @select="(color) => colorAction(color ?? '')"
        />
      </PictureFormatField>
      <div class="shape-format-font-fields__toggles">
        <ShapeFormatCheckbox :controller="controller" field="textBold" />
        <ShapeFormatCheckbox :controller="controller" field="textItalic" />
        <ShapeFormatCheckbox :controller="controller" field="textUnderline" />
        <ShapeFormatCheckbox :controller="controller" field="textStrike" />
      </div>
    </PictureFormatSection>
    <PictureFormatSection :title="controller.s.value('paragraph')">
      <ShapeFormatChoiceField :controller="controller" field="paragraphAlignment" />
      <ShapeFormatNumberField :controller="controller" field="paragraphBeforePt" />
      <ShapeFormatNumberField :controller="controller" field="paragraphAfterPt" />
      <ShapeFormatChoiceField :controller="controller" field="paragraphLineSpacing" />
      <ShapeFormatNumberField
        v-show="
          controller.isMixedField('paragraphLineSpacing') ||
          controller.props.snapshot?.values.paragraphLineSpacing === 'exact'
        "
        :controller="controller"
        field="paragraphLineSpacingPt"
      />
    </PictureFormatSection>
  </div>
</template>
<style scoped lang="scss">
.shape-format-font-fields__toggles {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
</style>
