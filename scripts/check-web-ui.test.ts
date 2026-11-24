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
      "apps/web/src/shared/dialog/DialogFooter.vue":
        '<template><div class="sheetcraft-dialog-footer" /></template>',
      "apps/web/src/shared/styles/_tdesign.scss": ".t-dialog { border-radius: 16px; }",
      "apps/web/src/shared/cell-text/FontFormatField.vue":
        'import { filterFontFamilyOption } from "./font-catalog";',
      "apps/web/src/shared/color/CustomColorInput.vue":
        '<template><input type="color" /></template>',
      "apps/web/src/modules/example/Editor.vue":
        '<template><TInputNumber class="sheetcraft-input-number--persistent-controls" theme="column" /></template><style>.editor { z-index: 30; }</style>',
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

  it("rejects raw disclosures, native color pickers, hand-written dialog footers, font filters, local TDesign overrides, and non-compliant InputNumber", () => {
    const root = fixture({
      "apps/web/src/modules/example/BadDialog.vue": `
        <script setup lang="ts">
        import { filterFontFamilyOption } from "../../shared/cell-text/font-catalog";
        </script>
        <template>
          <details><summary>More</summary></details>
          <input type="color" />
          <TInputNumber theme="normal" />
          <div class="sheetcraft-dialog-footer" />
        </template>
        <style scoped lang="scss">
        // Comments mentioning .t-button are ignored
        .example :deep(.t-button) { padding: 0; }
        </style>`,
    });

    expect(checkWebUi(root).map((violation) => violation.rule)).toEqual([
      "Use shared/dialog/DialogFooter instead of hand-writing .sheetcraft-dialog-footer markup or styles.",
      "Use FontFormatField instead of wiring filterFontFamilyOption directly in feature code.",
      "Keep TDesign (.t-*) overrides in apps/web/src/shared/styles/; do not style library internals locally.",
      "Use FormatSection or TDesign Collapse for disclosures; raw <details> elements are disallowed.",
      'Use ColorPaletteSelect or ColorPalette instead of raw <input type="color"> controls.',
      'InputNumber must set theme="column" and class="sheetcraft-input-number--persistent-controls".',
    ]);
  });
});
