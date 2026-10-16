<script setup lang="ts">
import RibbonToolbar from "../../../shared/ribbon/RibbonToolbar.vue";
import ShapeObjectToolControls from "./ShapeObjectToolControls.vue";
import {
  shapeObjectControlsLabels,
  type ShapeObjectToolsInput,
} from "../shape-object-controls-contract";
const props = defineProps<ShapeObjectToolsInput>();
</script>
<template>
  <RibbonToolbar :label="shapeObjectControlsLabels(props.locale).tools">
    <ShapeObjectToolControls v-bind="props" />
  </RibbonToolbar>
</template>
