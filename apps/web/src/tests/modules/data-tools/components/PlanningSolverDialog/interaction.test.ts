import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import PlanningSolverDialog from "../../../../../modules/data-tools/components/PlanningSolverDialog.vue";
import type { PlanningDraft } from "../../../../../modules/data-tools/simulation-types";
import RangeReferenceInput from "../../../../../shared/range-reference/RangeReferenceInput.vue";
import { createAppI18n } from "../../../../../shared/i18n";

let wrapper: ReturnType<typeof mount> | undefined;

const initial = (): PlanningDraft => ({
  objective: "=Sheet1!$F$17",
  direction: "maximize",
  method: "simplex",
  targetValue: "",
  variables: [
    { id: "variable-1", cell: "=Sheet1!$A$1:$A$3", kind: "continuous", lower: "0", upper: "10" },
  ],
  constraints: [{ id: "constraint-1", left: "=Sheet1!$B$1:$B$3", relation: "lte", right: "=10" }],
  nonnegative: true,
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  document.body.replaceChildren();
});

function mountDialog(overrides: Partial<InstanceType<typeof PlanningSolverDialog>["$props"]> = {}) {
  wrapper = mount(PlanningSolverDialog, {
    attachTo: document.body,
    props: { visible: true, initial: initial(), ...overrides },
    global: { plugins: [createAppI18n("en-US")] },
  });
  return wrapper;
}

describe("PlanningSolverDialog", () => {
  test("uses a single cell picker for the objective and range pickers for model inputs", async () => {
    const selectReference = vi.fn().mockResolvedValue(undefined);
    const dialog = mountDialog({ selectReference });
    const references = dialog.findAllComponents(RangeReferenceInput);

    await references[0]!.props("selectReference")!("=Sheet1!$F$17");
    await references[1]!.props("selectReference")!("=Sheet1!$A$1:$A$3");
    await references[2]!.props("selectReference")!("=Sheet1!$B$1:$B$3");
    await references[3]!.props("selectReference")!("=10");

    expect(selectReference).toHaveBeenNthCalledWith(1, "=Sheet1!$F$17", { singleCell: true });
    expect(selectReference).toHaveBeenNthCalledWith(2, "=Sheet1!$A$1:$A$3", {
      singleCell: false,
    });
    expect(selectReference).toHaveBeenNthCalledWith(3, "=Sheet1!$B$1:$B$3", {
      singleCell: false,
    });
    expect(selectReference).toHaveBeenNthCalledWith(4, "=10", { singleCell: false });
  });

  test("renders int and bin constraints with a disabled right-hand side", async () => {
    const dialog = mountDialog();
    const constraintRelation = dialog.findAllComponents(TSelect)[1]!;
    expect(constraintRelation.props("options")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "int · Integer", value: "integer" }),
        expect.objectContaining({ label: "bin · Binary", value: "binary" }),
      ]),
    );

    constraintRelation.vm.$emit("update:modelValue", "integer");
    await dialog.vm.$nextTick();
    expect(
      (dialog.get('[aria-label="Constraint / cell"] input').element as HTMLInputElement).disabled,
    ).toBe(true);

    constraintRelation.vm.$emit("update:modelValue", "binary");
    await dialog.vm.$nextTick();
    expect(
      (dialog.get('[aria-label="Constraint / cell"] input').element as HTMLInputElement).disabled,
    ).toBe(true);
  });

  test("keeps the model draft while changing method and solves with the selected method", async () => {
    const dialog = mountDialog();
    const references = dialog.findAllComponents(RangeReferenceInput);
    references[0]!.vm.$emit("update:modelValue", "=Sheet1!$G$17");
    references[1]!.vm.$emit("update:modelValue", "=Sheet1!$C$1:$C$3");
    await dialog.vm.$nextTick();

    const method = dialog.findAllComponents(TSelect).at(-1)!;
    method.vm.$emit("update:modelValue", "grg");
    await dialog.vm.$nextTick();
    method.vm.$emit("update:modelValue", "evolutionary");
    await dialog.vm.$nextTick();

    const latestDraft = dialog.emitted("draftChange")?.at(-1)?.[0] as PlanningDraft;
    expect(latestDraft).toMatchObject({
      objective: "=Sheet1!$G$17",
      method: "evolutionary",
      variables: [{ cell: "=Sheet1!$C$1:$C$3", lower: "0", upper: "10" }],
      constraints: [{ left: "=Sheet1!$B$1:$B$3", relation: "lte", right: "=10" }],
    });

    dialog.findComponent(Dialog).vm.$emit("confirm");
    expect(dialog.emitted("solve")?.at(-1)?.[0]).toMatchObject(latestDraft);
  });
});
