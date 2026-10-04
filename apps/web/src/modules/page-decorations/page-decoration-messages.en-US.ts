import type { PageDecorationMessageSchema } from "./page-decoration-messages";
export const pageDecorationEnUS = {
  pageDecoration: {
    backgroundImage: "Background",
    chooseBackground: "Choose background image",
    removeBackground: "Remove background",
    watermark: "Watermark",
    watermarkText: "Watermark text",
    fontSize: "Font size",
    color: "Color",
    opacity: "Opacity (%)",
    angle: "Angle",
    removeWatermark: "Remove watermark",
    confirm: "OK",
    cancel: "Cancel",
    draft: "DRAFT",
    confidential: "CONFIDENTIAL",
    customWatermark: "Custom watermark…",
    invalidImage: "Cannot read this image. Choose a supported image file.",
    failed: "Could not update the page appearance. Please try again.",
  },
} satisfies PageDecorationMessageSchema;
