<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import FontFormatPanel from "../../../shared/font-format/FontFormatPanel.vue";
import type {
  FontFormatOptions,
  FontFormatPatch,
  FontFormatState,
} from "../../../shared/font-format/useFontFormatPanel";
import { useAppI18n } from "../../../shared/i18n";
import { DEFAULT_HEADER_FOOTER_FORMAT, type HeaderFooterFormat } from "../header-footer-text";

const props = defineProps<{
  visible: boolean;
  format: HeaderFooterFormat;
  sampleText?: string;
}>();
const emit = defineEmits<{
  "update:visible": [value: boolean];
  confirm: [format: HeaderFooterFormat];
}>();
const { t } = useAppI18n();
const patch = ref<FontFormatPatch>({});
const fontOptions: FontFormatOptions = {
  defaultFontFamily: DEFAULT_HEADER_FOOTER_FORMAT.fontFamily,
  defaultFontSize: DEFAULT_HEADER_FOOTER_FORMAT.fontSize,
  defaultColor: `#${DEFAULT_HEADER_FOOTER_FORMAT.color}`,
  minFontSize: 1,
  maxFontSize: 409,
  sizeUnit: "pt",
  underlineStyles: ["none", "single", "double"],
};
const state = computed<FontFormatState>(() => ({
  fontFamily: { value: props.format.fontFamily, mixed: false },
  fontSize: { value: props.format.fontSize, mixed: false },
  bold: props.format.bold ? "on" : "off",
  italic: props.format.italic ? "on" : "off",
  underlineStyle: { value: props.format.underline || undefined, mixed: false },
  textColor: { value: `#${props.format.color}`, mixed: false },
  strikethrough: props.format.strikethrough ? "on" : "off",
  fontScript: { value: props.format.fontScript, mixed: false },
}));
function updateFont(value: FontFormatPatch): void {
  patch.value = { ...patch.value, ...value };
}
function close(): void {
  emit("update:visible", false);
}
function confirm(): void {
  const change = patch.value;
  if (Object.keys(change).length > 0) {
    emit("confirm", {
      ...props.format,
      fontFamily:
        change.fontFamily === undefined
          ? props.format.fontFamily
          : typeof change.fontFamily === "string"
            ? change.fontFamily
            : DEFAULT_HEADER_FOOTER_FORMAT.fontFamily,
      fontSize:
        change.fontSize === undefined
          ? props.format.fontSize
          : typeof change.fontSize === "number"
            ? change.fontSize
            : DEFAULT_HEADER_FOOTER_FORMAT.fontSize,
      bold: change.bold === undefined ? props.format.bold : change.bold === true,
      italic: change.italic === undefined ? props.format.italic : change.italic === true,
      underline:
        change.underline === undefined
          ? props.format.underline
          : change.underline === "double"
            ? "double"
            : change.underline === true,
      color:
        change.textColor === undefined
          ? props.format.color
          : (typeof change.textColor === "string"
              ? change.textColor
              : `#${DEFAULT_HEADER_FOOTER_FORMAT.color}`
            )
              .replace(/^#/, "")
              .toUpperCase(),
      strikethrough:
        change.strikethrough === undefined
          ? props.format.strikethrough
          : change.strikethrough === true || undefined,
      fontScript:
        change.fontScript === undefined ? props.format.fontScript : change.fontScript || undefined,
    });
  }
  close();
}
watch(
  () => props.visible,
  (visible) => {
    if (visible) patch.value = {};
  },
  { immediate: true },
);
</script>

<template>
  <Dialog
    :visible="visible"
    :header="t('pageLayout.headerFooterFont')"
    width="min(640px, calc(100vw - 32px))"
    :confirm-btn="t('pageLayout.confirm')"
    :cancel-btn="t('pageLayout.cancel')"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    @confirm="confirm"
    @close="close"
  >
    <FontFormatPanel
      :state="state"
      :patch="patch"
      :sample-value="sampleText ?? null"
      :options="fontOptions"
      @update:patch="updateFont"
    />
  </Dialog>
</template>
