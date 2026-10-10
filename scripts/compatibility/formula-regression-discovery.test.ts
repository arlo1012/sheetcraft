import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { functionRegistrationOffset, sourceFiles } from "./formula-regression-discovery.mts";

test("source discovery sorts every directory independently of enumeration order", () => {
  const root = resolve("fixture");
  const entry = (name: string, directory = false) => ({
    name,
    isDirectory: () => directory,
  });
  const directories = new Map([
    [resolve(root, "sources"), [entry("z.ts"), entry("nested", true), entry("a.ts")]],
    [resolve(root, "sources/nested"), [entry("z.ts"), entry("deeper", true), entry("a.ts")]],
    [resolve(root, "sources/nested/deeper"), [entry("b.ts"), entry("A.ts"), entry("a.ts")]],
  ]);
  const expected = [
    "sources/a.ts",
    "sources/nested/a.ts",
    "sources/nested/deeper/A.ts",
    "sources/nested/deeper/a.ts",
    "sources/nested/deeper/b.ts",
    "sources/nested/z.ts",
    "sources/z.ts",
  ];

  assert.deepEqual(
    sourceFiles(root, "sources", (path) => directories.get(path)!),
    expected,
  );
  assert.deepEqual(
    sourceFiles(root, "sources", (path) => [...directories.get(path)!].reverse()),
    expected,
  );
  // Discovery must not mutate a provider's entries while imposing its own order.
  assert.equal(directories.get(resolve(root, "sources"))![0]!.name, "z.ts");
});

for (const [name, errorLiteral, similarName] of [
  ["NA", "#N/A", "ISNA"],
  ["VALUE", "#VALUE!", "NUMBERVALUE"],
] as const) {
  test(`${name} implementation locator selects exact registration metadata`, () => {
    const before = [
      `const error = formulaError("${name}");`,
      `const rendered = "${errorLiteral}";`,
      `// defineFunction({ name: "${name}" }, unrelated);`,
      `const ordinaryData = { name: "${name}" };`,
      `defineFunction({ name: "${similarName}" }, unrelated);`,
    ].join("\n");
    const text = `${before}\ndefineFunction({ name: '${name}', category: "Information" }, evaluate);`;
    const offset = functionRegistrationOffset(text, name);

    assert.equal(offset, text.lastIndexOf(`'${name}'`));
    assert.equal(text.slice(offset, offset + name.length + 2), `'${name}'`);
    assert.equal(text.slice(0, offset).split("\n").length, 6);
  });

  test(`${name} implementation locator rejects quoted errors without a registration`, () => {
    const text = [
      `const error = formulaError("${name}");`,
      `const rendered = "${errorLiteral}";`,
      `// defineFunction({ name: "${name}" }, unrelated);`,
      `defineFunction({ name: "${similarName}" }, unrelated);`,
    ].join("\n");

    assert.equal(functionRegistrationOffset(text, name), -1);
  });
}

test("grouped registrations retain their exact quoted-name locator", () => {
  const text = 'const names = ["STDEV.S", "STDEV.P"];';

  assert.equal(functionRegistrationOffset(text, "STDEV.P"), text.indexOf('"STDEV.P"'));
  assert.equal(functionRegistrationOffset(text, "STDEV"), -1);
});
