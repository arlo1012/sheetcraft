<script setup lang="ts">
import { computed, ref } from "vue";
import { Button } from "tdesign-vue-next/es/button";
import { Plus } from "lucide-vue-next";
import { useAppI18n } from "../../shared/i18n";
import OptionList from "../../shared/option-list/OptionList.vue";
import { importProcessOnFlowchart } from "./processon-import";
import FlowchartCanvas from "./FlowchartCanvas.vue";
import {
  FLOWCHART_MAX_BYTES,
  parseFlowchartDocument,
  type FlowchartDocument,
} from "./flowchart-document";
import { createFlowchartTemplate, type FlowchartStart } from "./flowchart-templates";
const props = defineProps<{
  start: FlowchartStart;
  existing: { sheetName: string; document: FlowchartDocument }[];
}>();
const emit = defineEmits<{ choose: [chart: FlowchartDocument] }>();
const { locale, t } = useAppI18n();
const zh = computed(() => locale.value === "zh-CN");
const category = ref<"templates" | "workbook" | "import">(
  props.start === "import" ? "import" : "templates",
);
const categories = computed(() =>
  (
    [
      { value: "templates", label: t("flowchart.templates") },
      { value: "workbook", label: t("flowchart.workbook") },
      { value: "import", label: t("flowchart.file") },
    ] as const
  ).filter((item) => item.value !== "workbook" || props.start === "gallery"),
);
const templates = computed(() =>
  (["blank", "basic", "approval"] as const).map((type) =>
    createFlowchartTemplate(type, zh.value ? "zh-CN" : "en-US"),
  ),
);
const file = ref<HTMLInputElement>();
const invalid = ref(false);
async function importFile(event: Event) {
  const input = event.target as HTMLInputElement,
    source = input.files?.[0];
  input.value = "";
  if (!source) return;
  try {
    if (source.size > FLOWCHART_MAX_BYTES) throw new RangeError();
    const json = new TextDecoder("utf-8", { fatal: true }).decode(await source.arrayBuffer());
    const value: unknown = JSON.parse(json);
    emit(
      "choose",
      source.name.toLowerCase().endsWith(".pos")
        ? importProcessOnFlowchart(value)
        : parseFlowchartDocument(value),
    );
  } catch {
    invalid.value = true;
  }
}
</script>
<template>
  <div class="picker">
    <OptionList
      variant="navigation"
      :model-value="category"
      :options="categories"
      :label="t('flowchart.source')"
      @select="category = $event"
    />
    <div v-if="category === 'import'">
      <p>{{ t("flowchart.importHint") }}</p>
      <input
        ref="file"
        name="flowchart-import-file"
        type="file"
        accept=".json,.pos"
        hidden
        :aria-label="t('flowchart.choose')"
        @change="importFile"
      />
      <Button @click="file?.click()">{{ t("flowchart.choose") }}</Button>
      <p v-if="invalid" role="alert">
        {{ t("flowchart.invalid") }}
      </p>
    </div>
    <div v-else class="cards">
      <template v-if="category === 'templates'">
        <button
          v-for="template in templates"
          :key="template.title"
          :aria-label="template.title"
          type="button"
          @click="emit('choose', template)"
        >
          <div class="thumbnail">
            <FlowchartCanvas v-if="template.nodes.length" :document="template" /><Plus v-else />
          </div>
          {{ template.title }}
        </button>
      </template>
      <template v-else>
        <p v-if="!existing.length">
          {{ t("flowchart.none") }}
        </p>
        <button
          v-for="(chart, i) in existing"
          :key="i"
          type="button"
          @click="emit('choose', parseFlowchartDocument(chart.document))"
        >
          <div class="thumbnail"><FlowchartCanvas :document="chart.document" /></div>
          {{ chart.sheetName }} · {{ chart.document.title }}
        </button>
      </template>
    </div>
  </div>
</template>
<style scoped lang="scss">
@use "../../shared/gallery/gallery-choice" as gallery;
.picker {
  display: grid;
  grid-template-columns: 135px 1fr;
  gap: 20px;
  min-height: 240px;
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(165px, 100%), 1fr));
  gap: 12px;
  align-content: start;
  max-height: 55vh;
  overflow: auto;
}
.cards button {
  @include gallery.choice(10px);
}
.thumbnail {
  height: 115px;
  display: grid;
  place-items: center;
  margin-bottom: 8px;
}
</style>
