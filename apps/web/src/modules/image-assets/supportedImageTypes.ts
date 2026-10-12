/** Picker/clipboard hints only; actual encoded bytes still require source preflight. */
export const SUPPORTED_IMAGE_INPUT_TYPES = Object.freeze([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/x-ms-bmp",
  "image/x-bmp",
  "image/svg+xml",
]);
export const SUPPORTED_IMAGE_FILE_ACCEPT = [
  ...SUPPORTED_IMAGE_INPUT_TYPES,
  ".png",
  ".jpg",
  ".jpeg",
  ".jpe",
  ".gif",
  ".webp",
  ".bmp",
  ".svg",
].join(",");
