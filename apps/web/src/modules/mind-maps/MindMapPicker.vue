<script setup lang="ts">
import { computed, ref } from "vue";
import { Button } from "tdesign-vue-next/es/button";
import OptionList from "../../shared/option-list/OptionList.vue";
import { useAppI18n } from "../../shared/i18n";
import { MAX_DIAGRAM_SOURCE_BYTES } from "../attachments/diagram-source";
import {
  mindMapLayouts,
  parseMindMapDocument,
  createMindMap,
  type MindMapStart,
  type MindMapDocument,
} from "./mind-map-document";
import { importHeadingOutline } from "./mind-map-outline";
import MindMapCanvas from "./MindMapCanvas.vue";
const props = defineProps<{
  start: MindMapStart;
  existing: { sheetName: string; document: MindMapDocument }[];
}>();
const emit = defineEmits<{ choose: [source: MindMapDocument] }>();
const { t } = useAppI18n();
const page = ref<"new" | "open" | "import">(
  props.start === "workbook" && props.existing.length ? "open" : "new",
);
const options = computed(() =>
  (["new", "open", "import"] as const)
    .map((value) => ({ value, label: t(`mindMap.${value}`) }))
    .filter((option) => option.value !== "open" || props.start === "workbook"),
);
const templates = computed(() =>
  mindMapLayouts.map((layout) => {
    const doc = createMindMap(layout, t(`mindMap.${layout}`), t("mindMap.center"));
    doc.root.children = [1, 2, 3].map((index) => ({
      id: "branch-" + index,
      text: t("mindMap.branch") + " " + index,
      children: [],
      collapsed: false,
    }));
    return doc;
  }),
);
const picker = ref<HTMLInputElement>();
const error = ref(false);
async function read(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0];
  input.value = "";
  if (!file) return;
  try {
    if (file.size > MAX_DIAGRAM_SOURCE_BYTES) throw new RangeError();
    const data = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
    const source = file.name.toLowerCase().endsWith(".md")
      ? importHeadingOutline(data)
      : parseMindMapDocument(JSON.parse(data));
    emit("choose", source);
  } catch {
    error.value = true;
  }
}
</script>
<template>
  <div class="mind-picker">
    <OptionList
      variant="navigation"
      :label="t('mindMap.source')"
      :options="options"
      :model-value="page"
      @select="page = $event"
    />
    <section>
      <template v-if="page === 'new'">
        <h3>{{ t("mindMap.templates") }}</h3>
        <div class="cards">
          <button
            v-for="template in templates"
            :key="template.layout"
            :aria-label="template.title"
            @click="emit('choose', parseMindMapDocument(template))"
          >
            <MindMapCanvas :document="template" /><span>{{ template.title }}</span>
          </button>
        </div>
      </template>
      <template v-else-if="page === 'open'">
        <p v-if="!existing.length">{{ t("mindMap.empty") }}</p>
        <div class="cards">
          <button
            v-for="(item, i) in existing"
            :key="i"
            @click="emit('choose', parseMindMapDocument(item.document))"
          >
            <MindMapCanvas :document="item.document" /><span
              >{{ item.sheetName }} · {{ item.document.title }}</span
            >
          </button>
        </div>
      </template>
      <template v-else>
        <p>{{ t("mindMap.hint") }}</p>
        <input ref="picker" hidden type="file" accept=".json,.md" @change="read" />
        <Button @click="picker?.click()">{{ t("mindMap.choose") }}</Button>
        <p v-if="error" role="alert">{{ t("mindMap.invalid") }}</p>
      </template>
    </section>
  </div>
</template>
<style scoped lang="scss">
@use "../../shared/gallery/gallery-choice" as gallery;
.mind-picker {
  display: grid;
  grid-template-columns: 128px minmax(0, 1fr);
  gap: 20px;
  min-height: 280px;
}
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(145px, 100%), 1fr));
  gap: 12px;
  max-height: 53vh;
  overflow: auto;
}
.cards button {
  @include gallery.choice(8px);
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
}
.cards svg {
  height: 90px;
}
h3 {
  margin: 0 0 14px;
  font-size: 14px;
}
</style>
