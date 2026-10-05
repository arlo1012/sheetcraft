import { fileURLToPath } from "node:url";

// Load Hunspell data as browser assets; package entrypoints use node:fs.
export const dictionaryAliases = ["dictionary-en", "dictionary-en-gb"].flatMap((name) =>
  ["aff", "dic"].map((extension) => ({
    find: new RegExp(`^${name}/index\\.${extension}(?=\\?|$)`),
    replacement: fileURLToPath(
      new URL(`./node_modules/${name}/index.${extension}`, import.meta.url),
    ),
  })),
);
