<script setup lang="ts">
import { computed, ref, watch } from "vue";
import FontFormatField from "../../../home-tools/components/FontFormatField.vue";
import { useFontCatalog } from "../../../../shared/cell-text/useFontCatalog";
import { resolveFontFamilyName } from "../../../../shared/cell-text/font-catalog";
import FontSettingsAction from "../../../../shared/cell-text/FontSettingsAction.vue";
import PictureFormatSection from "../../../sheet-images/components/format-pane/PictureFormatSection.vue";
import PictureFormatField from "../../../sheet-images/components/format-pane/PictureFormatField.vue";
import ShapeFormatNumberField from "./ShapeFormatNumberField.vue";
import ShapeFormatCheckbox from "./ShapeFormatCheckbox.vue";
import ShapeFormatChoiceField from "./ShapeFormatChoiceField.vue";
import type { ShapeFormatController } from "./useShapeFormatPane";
const props = defineProps<{ controller: ShapeFormatController }>();
const family = computed(() => props.controller.props.snapshot?.values.fontFamily);
const draft = ref(family.value),
  dirty = ref(false),
  error = ref<string>();
watch(
  () => props.controller.ownerKey.value,
  () => {
    draft.value = family.value;
    dirty.value = false;
    error.value = undefined;
  },
);
watch(family, (value) => {
  if (!dirty.value) draft.value = value;
});
const { fontOptions } = useFontCatalog(() =>
  [family.value, draft.value].filter((value): value is string => !!value),
);
const options = computed(() =>
  fontOptions.value.map(({ label, value, aliases }) => ({
    label,
    value,
    aliases,
    fontFamily: value,
  })),
);
const capability = computed(() => props.controller.fieldCapability("fontFamily"));
const action = computed(() => {
  const apply = props.controller.session.fieldAction("fontFamily");
  return (value: string | number) => {
    if (typeof value !== "string" || !value.trim() || !capability.value.enabled) return;
    draft.value = resolveFontFamilyName(value.trim());
    dirty.value = true;
    if (apply(draft.value)) {
      dirty.value = false;
      error.value = undefined;
    } else error.value = props.controller.s.value("applyRejected");
  };
});
function escape(event: KeyboardEvent) {
  if (event.key === "Escape" && dirty.value) {
    event.preventDefault();
    event.stopPropagation();
    draft.value = family.value;
    dirty.value = false;
    error.value = undefined;
  }
}
</script>
<template>
  <div class="shape-format-font-fields">
    <PictureFormatSection :title="controller.s.value('font')" initially-open>
      <PictureFormatField
        :label="controller.s.value('fontFamily')"
        :reason="capability.enabled ? undefined : capability.reason"
        :error="error"
        data-shape-format-field="fontFamily"
      >
        <div @keydown.capture="escape">
          <FontFormatField
            :model-value="draft"
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
      <ShapeFormatNumberField :controller="controller" field="paragraphLineSpacingPt" />
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
