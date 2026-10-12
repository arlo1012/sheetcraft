import type { ShapePresetPath } from "./types.js";

/** Public geometry helpers also reject hand-built paths outside the evaluator's limits. */
export function assertShapePathBudget(path: ShapePresetPath): void {
  if (!Array.isArray(path.commands) || path.commands.length > 1024)
    throw new RangeError("Shape path exceeds its command budget.");
  for (const command of path.commands) {
    const length =
      command[0] === "M" || command[0] === "L"
        ? 3
        : command[0] === "Q"
          ? 5
          : command[0] === "C" || command[0] === "A"
            ? 7
            : command[0] === "Z"
              ? 1
              : 0;
    if (!length || command.length !== length) throw new TypeError("Invalid shape path command.");
    if (
      command
        .slice(1)
        .some(
          (value: unknown) =>
            typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 10_000_000,
        )
    )
      throw new RangeError("Shape path exceeds its coordinate budget.");
    if (
      command[0] === "A" &&
      (command[1] < 0 || command[2] < 0 || Math.abs(command[6] - command[5]) > 4 * Math.PI + 1e-8)
    )
      throw new RangeError("Shape arc exceeds its work budget.");
  }
}
