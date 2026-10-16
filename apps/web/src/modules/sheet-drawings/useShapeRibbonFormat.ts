import { computed, watch } from "vue";
import type { ShapeGroupPath } from "@sheetcraft/core/shape-group";
import { useOwnedShapeFormatPane } from "./useOwnedShapeFormatPane";
import { useOwnedShapeGroupFormatPane } from "./useOwnedShapeGroupFormatPane";

/** A selection-owned formatting adapter does not imply that the properties pane is open. */
export function useShapeRibbonFormat(options: {
  root: Parameters<typeof useOwnedShapeFormatPane>[0];
  group: Parameters<typeof useOwnedShapeGroupFormatPane>[0];
  getPaths: () => readonly ShapeGroupPath[];
  isTextEditing: () => boolean;
}) {
  const root = useOwnedShapeFormatPane(options.root),
    group = useOwnedShapeGroupFormatPane(options.group);
  watch(
    () =>
      [
        options.root.getWorkbook(),
        options.root.getSheet(),
        options.root.getGeneration(),
        JSON.stringify(options.getPaths()),
        !!options.root.getMetrics?.(),
        options.isTextEditing(),
      ] as const,
    () => {
      root.close();
      group.close();
      const paths = options.getPaths();
      if (options.isTextEditing() || paths.length !== 1) return;
      const path = paths[0]!,
        source = options.root.getSheet().drawings?.find((d) => d.id === path[0]);
      if (!source || (source.kind === "shape" && source.shapeConnector)) return;
      if (source.kind === "shapeGroup") group.open(source, path);
      else if (path.length === 1 && (source.kind === "shape" || source.kind === "textBox"))
        root.open(source);
    },
    { immediate: true, flush: "post" },
  );
  return {
    snapshot: computed(() => group.snapshot.value ?? root.snapshot.value),
    capabilities: computed(() =>
      group.snapshot.value ? group.capabilities.value : root.capabilities.value,
    ),
    onIntent: (intent: Parameters<typeof root.onIntent>[0]) =>
      group.snapshot.value ? group.onIntent(intent) : root.onIntent(intent),
  };
}
