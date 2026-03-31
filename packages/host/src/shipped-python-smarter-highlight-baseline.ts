export const SHIPPED_PYTHON_SMARTER_HIGHLIGHT_SEGMENTS = [
  ["#!/usr/bin/env python3"],
  [""],
  ["def ", "main", "() -> None:"],
  ["    ", "print", '("hello from py")'],
  [""],
  ['if __name__ == "__main__":'],
  ["    main()"],
] as const;

export const SHIPPED_PYTHON_SMARTER_HIGHLIGHT_STYLE_BUCKETS = [
  [null],
  [null],
  [null, "syntaxFunction+bold", null],
  [null, "syntaxFunction+italic", null],
  [null],
  [null],
  [null],
] as const;
