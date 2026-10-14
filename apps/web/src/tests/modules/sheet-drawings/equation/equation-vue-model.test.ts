// @vitest-environment node
import { expectTypeOf, test } from "vitest";
import type { Ref, UnwrapRef } from "vue";
import type { EquationDocument } from "@sheetcraft/core/equation-document";
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
test("Vue pure-data registration preserves exact equation types including recursive children", () => {
  expectTypeOf<UnwrapRef<EquationDocument>>().toEqualTypeOf<EquationDocument>();
  expectTypeOf<UnwrapRef<Ref<EquationDocument>>>().toEqualTypeOf<EquationDocument>();
  expectTypeOf<UnwrapRef<SheetGraphicDrawing>["equationDocument"]>().toEqualTypeOf<
    EquationDocument | undefined
  >();
});
