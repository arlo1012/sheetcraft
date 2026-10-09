import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { checkWebUi } from "./check-web-ui.mts";

const temporaryRoots: string[] = [];

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "sheetcraft-web-ui-"));
  temporaryRoots.push(root);
  for (const [path, content] of Object.entries(files)) {
    const file = join(root, path);
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, content);
  }
  return root;
}

afterEach(() => {
  while (temporaryRoots.length > 0) rmSync(temporaryRoots.pop() as string, { recursive: true });
});

describe("checkWebUi", () => {
  it("allows the shared primitives and local stacking", () => {
    const root = fixture({
      "apps/web/src/shared/floating/useFloatingPanel.ts":
        'import { computePosition } from "@floating-ui/dom";',
      "apps/web/src/shared/menu/MenuSurface.vue": '<div role="menu" />',
      "apps/web/src/modules/example/Editor.vue": ".editor { z-index: 30; }",
    });

    expect(checkWebUi(root)).toEqual([]);
  });

  it("reports bespoke floating, menu, and overlay implementations", () => {
    const root = fixture({
      "apps/web/src/modules/example/Menu.vue": [
        'import { useFloating } from "@floating-ui/vue";',
        '<div role="menu" />',
        ".menu { z-index: 80; }",
      ].join("\n"),
    });

    expect(checkWebUi(root).map((violation) => violation.rule)).toEqual([
      "Import Floating UI only through shared/floating; extend its composables instead.",
      "Use MenuSurface for menu semantics; keep only its approved shared implementations raw.",
      "Use an --sheetcraft-layer-* token for global overlays; numeric z-index values above 30 are reserved.",
    ]);
  });

  it("reserves every z-index above the local stacking limit", () => {
    const root = fixture({
      "apps/web/src/modules/example/Overlay.vue": ".overlay { z-index: 31; }",
    });

    expect(checkWebUi(root)).toMatchObject([
      {
        rule: "Use an --sheetcraft-layer-* token for global overlays; numeric z-index values above 30 are reserved.",
      },
    ]);
  });

  it("keeps the specialized border line chooser as the single semantic exception", () => {
    const root = fixture({
      "apps/web/src/shared/borders/BorderLineStylePanel.vue": '<div role="menu" />',
    });

    expect(checkWebUi(root)).toEqual([]);
  });

  it("reserves surface chrome even when nested SCSS expands a surface modifier", () => {
    const root = fixture({
      "apps/web/src/modules/example/Surface.vue": `
        <template>
          <MenuSurface class="example-surface" :class="{ 'example-surface--open': open }" />
        </template>
        <style scoped lang="scss">
        .example-surface {
          width: 280px;
          // Surface chrome must still be detected after a SCSS comment.
          border: 0;
          &:hover { background: white; }
          &--open {
            padding: 0;
            border-radius: 0;
          }
        }
        section .example-surface { box-shadow: none; }
        </style>`,
    });

    expect(checkWebUi(root).map((violation) => violation.rule)).toEqual([
      "Keep direct border styling on MenuSurface/FloatingPanelSurface; feature surfaces may set size, placement, and layer only.",
      "Keep direct background styling on MenuSurface/FloatingPanelSurface; feature surfaces may set size, placement, and layer only.",
      "Keep direct padding styling on MenuSurface/FloatingPanelSurface; feature surfaces may set size, placement, and layer only.",
      "Keep direct border-radius styling on MenuSurface/FloatingPanelSurface; feature surfaces may set size, placement, and layer only.",
      "Keep direct box-shadow styling on MenuSurface/FloatingPanelSurface; feature surfaces may set size, placement, and layer only.",
    ]);
  });

  it("does not treat descendant previews or unrelated classes as surface chrome", () => {
    const root = fixture({
      "apps/web/src/modules/example/Surface.vue": `
        <template><FloatingPanelSurface class="example-surface" /></template>
        <style scoped lang="scss">
        .example-surface {
          width: 320px;
          .preview { padding: 8px; border: 1px solid black; background: white; box-shadow: none; }
        }
        .unrelated { padding: 8px; border-radius: 8px; }
        </style>`,
    });

    expect(checkWebUi(root)).toEqual([]);
  });
});
