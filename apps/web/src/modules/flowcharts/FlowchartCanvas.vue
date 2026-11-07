<script setup lang="ts">
import { computed, useId } from "vue";
import {
  evaluateShapePresetAtDisplaySize,
  shapePresetPathToSvg,
} from "@sheetcraft/core/shape-presets";
import {
  FLOWCHART_WIDTH,
  FLOWCHART_HEIGHT,
  type FlowchartDocument,
  type FlowchartNode,
} from "./flowchart-document";
const props = defineProps<{
  document: FlowchartDocument;
  selected?: string;
  interactive?: boolean;
}>();
const emit = defineEmits<{
  nodeDown: [node: FlowchartNode, event: PointerEvent];
  edgeDown: [id: string];
  select: [id: string];
  editLabel: [];
  background: [];
}>();
const marker = "flow-arrow-" + useId();
const nodes = computed(() =>
  props.document.nodes.map((node) => {
    const shape = evaluateShapePresetAtDisplaySize(
      { preset: node.preset },
      node.width,
      node.height,
    );
    return {
      node,
      sites: shape.connectionSites,
      paths: shape.paths.map((path) => ({
        d: shapePresetPathToSvg(path),
        filled: path.filled,
        stroke: path.stroke,
      })),
    };
  }),
);
function anchor(node: FlowchartNode, dx: number, dy: number) {
  const sites = nodes.value.find((item) => item.node.id === node.id)?.sites;
  if (sites?.length) {
    const angle = Math.atan2(dy, dx);
    const distance = (pos: { x: number; y: number }) =>
      1 - Math.cos(Math.atan2(pos.y - node.height / 2, pos.x - node.width / 2) - angle);
    const site = sites.reduce((best, next) =>
      distance(next.position) < distance(best.position) ? next : best,
    ).position;
    return { x: node.x + site.x, y: node.y + site.y };
  }
  const horizontal = Math.abs(dx) * node.height >= Math.abs(dy) * node.width;
  return {
    x: node.x + node.width / 2 + (horizontal ? (Math.sign(dx) * node.width) / 2 : 0),
    y: node.y + node.height / 2 + (horizontal ? 0 : (Math.sign(dy) * node.height) / 2),
  };
}
const edges = computed(() => {
  const byId = new Map(props.document.nodes.map((n) => [n.id, n]));
  return props.document.edges.map((edge) => {
    const from = byId.get(edge.from)!,
      to = byId.get(edge.to)!;
    const dx = to.x + to.width / 2 - from.x - from.width / 2,
      dy = to.y + to.height / 2 - from.y - from.height / 2;
    const start = anchor(from, dx, dy),
      end = anchor(to, -dx, -dy);
    if (from === to) {
      const x = from.x + from.width,
        y = from.y + from.height / 2;
      return {
        edge,
        d: `M ${x} ${y} h 18 v ${-from.height / 2 - 12} H ${from.x + from.width / 2} v 12`,
        x,
        y: from.y - 16,
      };
    }
    return {
      edge,
      d: `M ${start.x} ${start.y} L ${end.x} ${end.y}`,
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2 - 6,
    };
  });
});
</script>
<template>
  <svg
    class="flowchart-canvas"
    :viewBox="`0 0 ${FLOWCHART_WIDTH} ${FLOWCHART_HEIGHT}`"
    :aria-label="document.title"
    @pointerdown.self="emit('background')"
  >
    <defs>
      <marker
        :id="marker"
        viewBox="0 0 10 10"
        refX="10"
        refY="5"
        markerWidth="6"
        markerHeight="6"
        orient="auto-start-reverse"
      >
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#476575" />
      </marker>
    </defs>
    <g
      v-for="{ edge, d, x, y } in edges"
      :key="edge.id"
      :data-flow-edge="edge.id"
      :tabindex="interactive ? 0 : undefined"
      :role="interactive ? 'button' : undefined"
      :aria-label="interactive ? edge.label || edge.from + ' → ' + edge.to : undefined"
      @keydown.enter="interactive && emit('edgeDown', edge.id)"
      @dblclick="interactive && emit('editLabel')"
      @pointerdown="interactive && emit('edgeDown', edge.id)"
    >
      <path
        :d="d"
        fill="none"
        :stroke="edge.id === selected ? '#005fd2' : '#476575'"
        :stroke-width="edge.id === selected ? 3 : 2"
        :marker-end="`url(#${marker})`"
      />
      <path v-if="interactive" :d="d" fill="none" stroke="transparent" stroke-width="14" />
      <text
        :x="x"
        :y="y"
        text-anchor="middle"
        font-size="14"
        stroke="#fff"
        stroke-width="4"
        paint-order="stroke"
      >
        {{ edge.label }}
      </text>
    </g>
    <g
      v-for="{ node, paths } in nodes"
      :key="node.id"
      :data-flow-node="node.id"
      :tabindex="interactive ? 0 : undefined"
      :role="interactive ? 'button' : undefined"
      :aria-label="interactive ? node.text : undefined"
      @keydown.enter="interactive && emit('select', node.id)"
      @dblclick="interactive && emit('editLabel')"
      :transform="`translate(${node.x} ${node.y})`"
      @pointerdown="interactive && emit('nodeDown', node, $event)"
    >
      <path
        v-for="(path, i) in paths"
        :key="i"
        :d="path.d"
        :fill="path.filled ? '#e7f2fa' : 'none'"
        :stroke="path.stroke ? '#456780' : 'none'"
        stroke-width="2"
      />
      <foreignObject
        :x="node.width * 0.1"
        :y="node.height * 0.08"
        :width="node.width * 0.8"
        :height="node.height * 0.84"
        ><div class="flowchart-label">{{ node.text }}</div></foreignObject
      >
      <rect
        v-if="selected === node.id"
        :width="node.width"
        :height="node.height"
        fill="none"
        stroke="#005fd2"
        stroke-dasharray="5 3"
        pointer-events="none"
      />
    </g>
  </svg>
</template>
<style scoped lang="scss">
.flowchart-canvas {
  display: block;
  width: 100%;
  height: 100%;
  background: white;
  user-select: none;
}
.flowchart-label {
  height: 100%;
  overflow: hidden;
  display: grid;
  align-content: center;
  text-align: center;
  font: 16px/1.2 sans-serif;
  color: #203746;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  pointer-events: none;
}
</style>
