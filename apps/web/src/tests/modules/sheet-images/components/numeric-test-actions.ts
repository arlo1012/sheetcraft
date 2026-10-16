import type {
  NumericCommitContext,
  NumericCommitResult,
  NumericDraftInputs,
} from "../../../../shared/numeric-field/types";
interface NumericTestField {
  props(): Pick<NumericDraftInputs, "value" | "spec" | "onCommit" | "ownerKey">;
}
/** Public callback contract checks replace the previous direct TInputNumber change emissions.
 * Native focus, parsing, Enter/blur and step gestures are covered separately by picture-unified-numeric.
 */
export function displayNumber(field: NumericTestField): number | undefined {
  const { value, spec } = field.props();
  if (value.kind !== "value") return undefined;
  return spec.toDisplay ? spec.toDisplay(value.value) : value.value;
}
export function captureDisplayCommit(field: NumericTestField) {
  const { onCommit: handler, spec, ownerKey } = field.props();
  const context: NumericCommitContext = {
    ownerKey,
    sessionId: "contract-test",
    source: "enter",
  };
  return (display: unknown): NumericCommitResult =>
    handler(
      {
        kind: "value",
        value: (typeof display === "number" && spec.fromDisplay
          ? spec.fromDisplay(display)
          : display) as number,
      },
      context,
    );
}
export function commitDisplay(field: NumericTestField, value: unknown): NumericCommitResult {
  return captureDisplayCommit(field)(value);
}
