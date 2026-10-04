import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { checkWebUi } from "./check-web-ui.mts";

const temporaryRoots: string[] = [];

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "idea10-web-ui-"));
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
      "Use an --idea-layer-* token for global overlays; numeric z-index values above 30 are reserved.",
    ]);
  });

  it("reserves every z-index above the local stacking limit", () => {
    const root = fixture({
      "apps/web/src/modules/example/Overlay.vue": ".overlay { z-index: 31; }",
    });

    expect(checkWebUi(root)).toMatchObject([
      {
        rule: "Use an --idea-layer-* token for global overlays; numeric z-index values above 30 are reserved.",
      },
    ]);
  });

  it("keeps the specialized border line chooser as the single semantic exception", () => {
    const root = fixture({
      "apps/web/src/shared/borders/BorderLineStylePanel.vue": '<div role="menu" />',
    });

    expect(checkWebUi(root)).toEqual([]);
  });
});
