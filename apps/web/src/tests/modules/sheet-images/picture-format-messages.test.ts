// @vitest-environment node
import { describe, expect, test } from "vitest";
import {
  PICTURE_FORMAT_CAPABILITY_REASON_KEYS,
  PICTURE_FORMAT_OPTION_LABEL_KEYS,
} from "../../../modules/sheet-images/picture-format-messages";
import { pictureFormatEnUS } from "../../../modules/sheet-images/picture-format-messages.en-US";
import { pictureFormatZhCN } from "../../../modules/sheet-images/picture-format-messages.zh-CN";
import { PICTURE_FORMAT_LABEL_KEYS } from "../../../modules/sheet-images/picture-format-pane-model";
import { enUS } from "../../../shared/i18n/messages/en-US";
import { zhCN } from "../../../shared/i18n/messages/zh-CN";

const locales = [
  { locale: "en-US", messages: pictureFormatEnUS, application: enUS },
  { locale: "zh-CN", messages: pictureFormatZhCN, application: zhCN },
] as const;

describe("picture format message coverage", () => {
  test("keeps the model label contract and host-only keys separate", () => {
    expect(new Set(PICTURE_FORMAT_LABEL_KEYS).size).toBe(PICTURE_FORMAT_LABEL_KEYS.length);
    for (const { messages } of locales) {
      const { capabilityReasons, options, ...labels } = messages.pictureFormat;
      expect(Object.keys(messages)).toEqual(["pictureFormat"]);
      expect(Object.keys(labels).sort()).toEqual([...PICTURE_FORMAT_LABEL_KEYS].sort());
      expect(Object.keys(capabilityReasons).sort()).toEqual(
        [...PICTURE_FORMAT_CAPABILITY_REASON_KEYS].sort(),
      );
      expect(Object.keys(options).sort()).toEqual([...PICTURE_FORMAT_OPTION_LABEL_KEYS].sort());
    }
  });

  for (const { locale, messages, application } of locales) {
    test(`${locale} supplies every caption and host message without empty values`, () => {
      const { capabilityReasons, options, ...labels } = messages.pictureFormat;
      const entries = [
        ...Object.entries(labels),
        ...Object.entries(capabilityReasons),
        ...Object.entries(options),
      ];
      for (const [key, value] of entries) {
        expect(typeof value).toBe("string");
        expect(value.trim(), key).toBe(value);
        expect(value.length, key).toBeGreaterThan(0);
        expect(value, key).not.toMatch(/[\r\n\t]/);
        expect(value, key).not.toBe(key);
        if (locale === "zh-CN" && key !== "percentUnit" && key !== "degreeUnit")
          expect(value, key).toMatch(/\p{Script=Han}/u);
        if (locale === "en-US") expect(value, key).not.toMatch(/\p{Script=Han}/u);
      }
    });

    test(`${locale} is installed in the application dictionary without fallbacks`, () => {
      expect(application.pictureFormat).toBe(messages.pictureFormat);
      for (const key of PICTURE_FORMAT_LABEL_KEYS)
        expect(application.pictureFormat[key]).toBe(messages.pictureFormat[key]);
    });

    test(`${locale} keeps dimensional units separate from field captions`, () => {
      const labels = messages.pictureFormat;
      expect(labels.percentUnit).toBe("%");
      expect(labels.degreeUnit).toBe("°");
      expect(new Set([labels.unitIn, labels.unitCm, labels.unitPt]).size).toBe(3);
      for (const key of PICTURE_FORMAT_LABEL_KEYS) {
        // unitPt is a unit selector caption, not a numeric field caption.
        if (
          key !== "unitPt" &&
          (key.endsWith("Pt") || key.endsWith("Deg") || key.endsWith("Percent"))
        )
          expect(labels[key], key).not.toMatch(/\b(?:in|cm|pt)\b|英寸|厘米|磅|[%°]|[（(]/);
      }
    });

    test(`${locale} distinguishes source center offsets from crop box coordinates`, () => {
      const labels = messages.pictureFormat;
      expect(labels.sourcePosition).not.toBe(labels.cropPosition);
      expect(labels.sourceWidthPt).not.toBe(labels.cropWidthPt);
      expect(labels.sourceHeightPt).not.toBe(labels.cropHeightPt);
      expect(labels.sourceOffsetXPt).not.toBe(labels.cropLeftPt);
      expect(labels.sourceOffsetYPt).not.toBe(labels.cropTopPt);
      const center = locale === "zh-CN" ? /中心偏移/ : /center offset/;
      expect(labels.sourceOffsetXPt).toMatch(center);
      expect(labels.sourceOffsetYPt).toMatch(center);
      expect(labels.cropLeftPt).not.toMatch(center);
      expect(labels.cropTopPt).not.toMatch(center);
      expect(labels.cropHelp).toMatch(
        locale === "zh-CN"
          ? /源图中心相对裁剪框中心/
          : /source center relative to the crop box center/,
      );
      expect(labels.cropHelp).toMatch(
        locale === "zh-CN"
          ? /未旋转布局框在工作表中的坐标/
          : /worksheet coordinates of the unrotated layout box/,
      );
      expect(labels.sizeHelp).toMatch(
        locale === "zh-CN" ? /图片自身轴线/ : /picture[’']s own axes/,
      );
    });

    test(`${locale} has distinct scopes for all five reset actions`, () => {
      const labels = messages.pictureFormat;
      const resetLabels = [
        labels.resetSize,
        labels.resetPicture,
        labels.resetCrop,
        labels.reset3dFormat,
        labels.reset3dRotation,
      ];
      expect(new Set(resetLabels).size).toBe(5);
      expect(labels.resetPicture).toMatch(locale === "zh-CN" ? /外观/ : /appearance/);
      expect(labels.resetCrop).toMatch(locale === "zh-CN" ? /裁剪/ : /crop/);
      expect(labels.reset3dFormat).toMatch(locale === "zh-CN" ? /三维格式/ : /3-D format/);
      expect(labels.reset3dRotation).toMatch(locale === "zh-CN" ? /三维旋转/ : /3-D rotation/);
    });

    test(`${locale} distinguishes capability blockers without promising unsupported effects`, () => {
      const reasons = messages.pictureFormat.capabilityReasons;
      expect(new Set(Object.values(reasons)).size).toBe(
        PICTURE_FORMAT_CAPABILITY_REASON_KEYS.length,
      );
      expect(reasons.groupContainer).not.toBe(reasons.sourceOnly);
      expect(reasons.missingSelection).not.toBe(reasons.missingMetrics);
      expect(reasons.missingMetrics).not.toBe(reasons.missingResource);
      expect(reasons.unsupportedFeature).toMatch(
        locale === "zh-CN" ? /暂不支持/ : /isn't supported yet/,
      );
      expect(messages.pictureFormat.keepTextFlatUnavailable).toMatch(
        locale === "zh-CN" ? /图片不适用/ : /not applicable to pictures/,
      );
      expect(Object.keys(messages.pictureFormat.options).sort()).toEqual(
        [
          "noShadow",
          "softShadow",
          "hardShadow",
          "inheritShadow",
          "inheritLine",
          "localLine",
        ].sort(),
      );
    });
  }

  test("uses familiar line modes and physical length units in both languages", () => {
    expect([
      pictureFormatEnUS.pictureFormat.none,
      pictureFormatEnUS.pictureFormat.solid,
      pictureFormatEnUS.pictureFormat.gradient,
    ]).toEqual(["No line", "Solid line", "Gradient line"]);
    expect([
      pictureFormatZhCN.pictureFormat.none,
      pictureFormatZhCN.pictureFormat.solid,
      pictureFormatZhCN.pictureFormat.gradient,
    ]).toEqual(["无线条", "实线", "渐变线"]);
    expect([
      pictureFormatEnUS.pictureFormat.unitIn,
      pictureFormatEnUS.pictureFormat.unitCm,
      pictureFormatEnUS.pictureFormat.unitPt,
    ]).toEqual(["in", "cm", "pt"]);
    expect([
      pictureFormatZhCN.pictureFormat.unitIn,
      pictureFormatZhCN.pictureFormat.unitCm,
      pictureFormatZhCN.pictureFormat.unitPt,
    ]).toEqual(["英寸", "厘米", "磅"]);
  });
});
