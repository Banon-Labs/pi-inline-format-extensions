export const SHIPPED_JAVASCRIPT_SMARTER_HIGHLIGHT_SEGMENTS = [
  ["const ", "value", " = 42;"],
  ["console", ".", "log", "(", "value", ");"],
] as const;

export const SHIPPED_JAVASCRIPT_SMARTER_HIGHLIGHT_STYLE_BUCKETS = [
  [null, "syntaxVariable+bold+underline", null],
  [
    "syntaxVariable+italic",
    null,
    "syntaxFunction+italic",
    null,
    "syntaxVariable+underline",
    null,
  ],
] as const;
