import type { WorkbookTheme } from "@idea10/core/workbook-theme";

export const PAGE_THEME_PRESETS: readonly WorkbookTheme[] = [
  {
    id: "office",
    name: "Office",
    accentColors: ["#4f81bd", "#c0504d", "#9bbb59", "#8064a2", "#4bacc6", "#f79646"],
    headingFont: "Inter",
    bodyFont: "Inter",
  },
  {
    id: "facet",
    name: "Facet",
    accentColors: ["#1f4e79", "#5b9bd5", "#70ad47", "#ffc000", "#4472c4", "#a5a5a5"],
    headingFont: "Aptos Display",
    bodyFont: "Aptos",
  },
  {
    id: "gallery",
    name: "Gallery",
    accentColors: ["#264478", "#e36c09", "#9bbb59", "#8064a2", "#4bacc6", "#c0504d"],
    headingFont: "Georgia",
    bodyFont: "Aptos",
  },
  {
    id: "organic",
    name: "Organic",
    accentColors: ["#77933c", "#c0504d", "#4f81bd", "#8064a2", "#f79646", "#4bacc6"],
    headingFont: "Trebuchet MS",
    bodyFont: "Trebuchet MS",
  },
  {
    id: "retrospect",
    name: "Retrospect",
    accentColors: ["#31859c", "#e46c0a", "#9bbb59", "#8064a2", "#c0504d", "#4f81bd"],
    headingFont: "Palatino Linotype",
    bodyFont: "Palatino Linotype",
  },
];
