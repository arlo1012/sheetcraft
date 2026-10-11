import { describe, expect, test } from "vitest";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { isPictureGroup } from "@sheetcraft/core/picture-group";
import type { PictureFrameLayoutContext } from "@sheetcraft/sheet-engine/picture-frame-layout";
import { fixture, legacy, tree, requireGroup, contextFor } from "./fixture";

type Action = "group" | "ungroup" | "deletePath" | "remove" | "updateMany" | "aspect";
function actionFixture(action: Action) {
  const f = fixture();
  if (action !== "group") f.owned(["a", "b"]);
  const run = () => {
    switch (action) {
      case "group":
        return f.tools.group();
      case "ungroup":
        return f.tools.group(true);
      case "deletePath":
        return f.tools.deletePath(["owned", "a"]);
      case "remove":
        return f.tools.remove();
      case "updateMany":
        return f.tools.updateMany([
          { ...requireGroup(f.sheet.floatingImages[0]), altText: "Edited" },
        ]);
      case "aspect":
        return f.tools.setAspectRatio(requireGroup(f.sheet.floatingImages[0]), true);
    }
  };
  return { ...f, run };
}
function duringMetrics(f: ReturnType<typeof fixture>, effect: () => void): void {
  const base = f.context.metrics.columns;
  let fired = false;
  f.context.metrics = {
    ...f.context.metrics,
    columns: {
      ...base,
      visiblePrefix: (index) => {
        if (!fired) {
          fired = true;
          effect();
        }
        return base.visiblePrefix(index);
      },
    },
  };
}

describe("owned command authority and failure outcomes", () => {
  test.each(["group", "ungroup", "deletePath", "remove", "updateMany", "aspect"] as const)(
    "%s retains selection/source/history when execute refuses or throws",
    (action) => {
      for (const mode of ["false", "throw"] as const) {
        const f = actionFixture(action);
        const before = serializeWorkbook(f.session.workbook);
        const selection = f.selectedIds.value;
        f.execute.mockImplementationOnce(() => {
          if (mode === "throw") throw new Error("command refused");
          return false;
        });
        expect(f.run()).toBe(false);
        expect(serializeWorkbook(f.session.workbook)).toEqual(before);
        expect(f.selectedIds.value).toBe(selection);
        expect(f.session.history.undoStack).toHaveLength(0);
        expect(f.session.history.redoStack).toHaveLength(0);
        expect(f.execute).toHaveBeenCalledOnce();
      }
    },
  );

  test.each(["group", "ungroup", "deletePath", "remove", "updateMany", "aspect"] as const)(
    "%s rejects a replacement effective context before execute",
    (action) => {
      const f = actionFixture(action);
      const before = f.forest();
      const selection = f.selectedIds.value;
      const replacement = { ...f.context };
      let reads = 0;
      f.getContextWith(() => (++reads === 1 ? f.context : replacement));
      expect(f.run()).toBe(false);
      expect(f.forest()).toEqual(before);
      expect(f.selectedIds.value).toBe(selection);
      expect(f.execute).not.toHaveBeenCalled();
    },
  );

  test("stale source on an unselected root cannot be overwritten by grouping", () => {
    const f = fixture();
    const before = f.forest();
    duringMetrics(f, () => {
      const other = f.sheet.floatingImages.find((root) => root.id === "c")!;
      if (isPictureGroup(other)) throw new Error("Expected standalone.");
      other.assetId = "newer-source";
    });
    const selection = f.selectedIds.value;
    expect(f.tools.group()).toBe(false);
    expect(f.sheet.floatingImages.slice(0, 2)).toEqual(before.slice(0, 2));
    expect(f.sheet.floatingImages[2]).toMatchObject({ assetId: "newer-source" });
    expect(f.selectedIds.value).toBe(selection);
    expect(f.execute).not.toHaveBeenCalled();
  });

  test("selection changes during planning stay current and prevent old plan execution", () => {
    const f = fixture();
    const before = f.forest();
    duringMetrics(f, () => {
      f.selectedIds.value = ["c"];
    });
    expect(f.tools.group()).toBe(false);
    expect(f.selectedIds.value).toEqual(["c"]);
    expect(f.forest()).toEqual(before);
    expect(f.execute).not.toHaveBeenCalled();
  });

  test("replacement Sheet instance with the same ID rejects the old owner's plan", () => {
    const f = fixture();
    const before = f.forest();
    duringMetrics(f, () => {
      f.setSheet({ ...f.sheet, floatingImages: [...f.sheet.floatingImages] });
    });
    expect(f.tools.group()).toBe(false);
    expect(f.forest()).toEqual(before);
    expect(f.execute).not.toHaveBeenCalled();
  });

  test("in-place metrics/layout replacement is a stale context even with the same context object", () => {
    for (const property of ["metrics", "layout"] as const) {
      const f = fixture();
      const before = f.forest();
      const fresh = contextFor(f.sheet);
      duringMetrics(f, () => {
        if (property === "metrics") f.context.metrics = fresh.metrics;
        else f.context.layout = fresh.layout;
      });
      expect(f.tools.group()).toBe(false);
      expect(f.forest()).toEqual(before);
      expect(f.execute).not.toHaveBeenCalled();
    }
  });

  test.each(["group", "ungroup", "deletePath", "remove", "updateMany"] as const)(
    "%s is blocked by busy/protected state without command or selection changes",
    (action) => {
      for (const restriction of ["busy", "protected"] as const) {
        const f = actionFixture(action);
        if (restriction === "busy") f.setBusy();
        else f.sheet.properties.protected = true;
        const before = f.forest();
        const selection = f.selectedIds.value;
        expect(f.run()).toBe(false);
        expect(f.forest()).toEqual(before);
        expect(f.selectedIds.value).toBe(selection);
        expect(f.execute).not.toHaveBeenCalled();
      }
    },
  );

  test("updateMany resolves hidden nested source geometry even on untouched group roots", () => {
    const value = tree();
    const inner = value.members[0]!;
    if (inner.kind !== "grouped-group-v1") throw new Error("Expected nested group.");
    const hidden = inner.members[1]!;
    if (hidden.kind !== "grouped-picture-v1") throw new Error("Expected leaf.");
    hidden.hidden = true;
    hidden.frame.source.widthRatio = Number.MAX_VALUE;
    const f = fixture([legacy("other", 600), value]);
    const before = f.forest();
    expect(f.tools.updateMany([{ ...legacy("other", 600), altText: "Edited" }])).toBe(false);
    expect(f.forest()).toEqual(before);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.session.history.undoStack).toHaveLength(0);
  });

  test("unselected invalid hidden trees reject group/delete atomically before execution", () => {
    const value = tree();
    const inner = value.members[0]!;
    if (inner.kind !== "grouped-group-v1") throw new Error("Expected nested group.");
    const hidden = inner.members[1]!;
    if (hidden.kind !== "grouped-picture-v1") throw new Error("Expected leaf.");
    hidden.frame.source.widthRatio = Number.MAX_VALUE;
    const f = fixture([legacy("x"), legacy("y", 150), value]);
    const before = f.forest();
    expect(f.tools.group()).toBe(false);
    expect(f.tools.remove(["x"])).toBe(false);
    expect(f.tools.deletePath(["root"])).toBe(false);
    expect(f.forest()).toEqual(before);
    expect(f.selectedIds.value).toEqual(["x", "y"]);
    expect(f.execute).not.toHaveBeenCalled();
  });

  test("proposed invalid hidden descendants cannot slip through updateMany", () => {
    const f = fixture([tree(), legacy("other", 600)]);
    f.selectedIds.value = ["root"];
    const before = f.forest();
    const proposed = requireGroup(f.forest()[0]);
    const inner = proposed.members[0]!;
    if (inner.kind !== "grouped-group-v1") throw new Error("Expected nested group.");
    inner.frame.rect.widthRatio = Number.MAX_VALUE;
    expect(f.tools.updateMany([proposed])).toBe(false);
    expect(f.forest()).toEqual(before);
    expect(f.execute).not.toHaveBeenCalled();
  });

  test("stale metadata callbacks cannot overwrite a newer owned descendant source", () => {
    const f = fixture([tree(), legacy("other", 600)]);
    const source = requireGroup(f.forest()[0]);
    const current = requireGroup(f.sheet.floatingImages[0]);
    const inner = current.members[0]!;
    if (inner.kind !== "grouped-group-v1") throw new Error("Expected nested owner.");
    const member = inner.members[0]!;
    if (member.kind !== "grouped-picture-v1") throw new Error("Expected leaf.");
    member.assetId = "newer-source";
    const before = f.forest();
    const selection = f.selectedIds.value;
    expect(f.tools.rename(source, "Old callback label")).toBe(false);
    expect(f.tools.toggleVisibility(source)).toBe(false);
    expect(f.forest()).toEqual(before);
    expect(f.selectedIds.value).toBe(selection);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.session.history.undoStack).toHaveLength(0);
  });

  test("fresh metadata callbacks can edit an unselected owned root without touching its descendants", () => {
    const f = fixture([tree(), legacy("other", 600)]);
    f.selectedIds.value = ["other"];
    const source = requireGroup(f.forest()[0]);
    expect(f.tools.rename(source, "Current label")).toBe(true);
    const renamed = requireGroup(f.sheet.floatingImages[0]);
    expect(renamed.altText).toBe("Current label");
    expect(renamed.members).toEqual(source.members);
    expect(f.tools.toggleVisibility(renamed)).toBe(true);
    expect(requireGroup(f.sheet.floatingImages[0]).hidden).toBe(true);
    expect(f.selectedIds.value).toEqual(["other"]);
    expect(f.session.history.undoStack).toHaveLength(2);
  });

  test("framed roots cannot be flat-grouped when their effective context is unavailable", () => {
    const f = fixture();
    f.setContext(undefined);
    const before = f.forest();
    expect(f.tools.group()).toBe(false);
    expect(f.forest()).toEqual(before);
    expect(f.selectedIds.value).toEqual(["a", "b"]);
    expect(f.execute).not.toHaveBeenCalled();
  });

  test("undefined or throwing frame-context providers refuse owned operations safely", () => {
    const f = actionFixture("ungroup");
    const before = f.forest();
    f.setContext(undefined);
    expect(f.run()).toBe(false);
    f.getContextWith((): PictureFrameLayoutContext => {
      throw new Error("unavailable view");
    });
    expect(f.run()).toBe(false);
    expect(f.forest()).toEqual(before);
    expect(f.selectedIds.value).toEqual(["owned"]);
    expect(f.execute).not.toHaveBeenCalled();
  });
});
