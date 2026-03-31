export const SHIPPED_TYPESCRIPT_SMARTER_HIGHLIGHT_SEGMENTS = [
  ["type ", "Answer", " = {"],
  ["  ", "value", ": number;"],
  ["};"],
  [""],
  ["const ", "answer", ": ", "Answer", " = { ", "value", ": 42 };"],
  ["console", ".", "log", "(", "answer", ".", "value", ");"],
] as const;

export const SHIPPED_TYPESCRIPT_SMARTER_HIGHLIGHT_STYLE_BUCKETS = [
  [null, "syntaxType+bold", null],
  [null, "syntaxVariable+bold", null],
  [null],
  [null],
  [
    null,
    "syntaxVariable+bold+underline",
    null,
    "syntaxType",
    null,
    "syntaxVariable+bold",
    null,
  ],
  [
    "syntaxVariable+italic",
    null,
    "syntaxFunction+italic",
    null,
    "syntaxVariable+underline",
    null,
    "syntaxVariable",
    null,
  ],
] as const;
