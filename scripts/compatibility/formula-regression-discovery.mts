import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

type SourceEntry = { name: string; isDirectory(): boolean };
type ReadSourceEntries = (directory: string) => readonly SourceEntry[];

export function sourceFiles(
  root: string,
  directory: string,
  readEntries: ReadSourceEntries = (path) => readdirSync(path, { withFileTypes: true }),
): string[] {
  return (
    [...readEntries(resolve(root, directory))]
      // Code-point ordering is independent of filesystem enumeration and locale.
      .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))
      .flatMap((entry) =>
        entry.isDirectory()
          ? sourceFiles(root, `${directory}/${entry.name}`, readEntries)
          : [`${directory}/${entry.name}`],
      )
  );
}

export function functionRegistrationOffset(text: string, name: string): number {
  // These function names are also typed-error codes in unrelated implementations.
  // Match their actual registration metadata, never a quoted error-code occurrence.
  if (name !== "NA" && name !== "VALUE") return text.indexOf(`"${name}"`);

  const tree = ts.createSourceFile("functions.ts", text, ts.ScriptTarget.Latest, true);
  let offset = -1;
  function visit(node: ts.Node): void {
    if (
      ts.isPropertyAssignment(node) &&
      node.name.getText(tree) === "name" &&
      ts.isStringLiteral(node.initializer) &&
      node.initializer.text === name &&
      ts.isObjectLiteralExpression(node.parent) &&
      ts.isCallExpression(node.parent.parent) &&
      node.parent.parent.expression.getText(tree) === "defineFunction" &&
      node.parent.parent.arguments[0] === node.parent
    )
      offset = node.initializer.getStart(tree);
    if (offset < 0) ts.forEachChild(node, visit);
  }
  visit(tree);
  return offset;
}
