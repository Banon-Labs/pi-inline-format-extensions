export const SHIPPED_PYTHON_SMARTER_HIGHLIGHT_SEGMENTS = [
  ["#!/usr/bin/env python3"],
  [""],
  ["def ", "main", "() -> None:"],
  ["    ", "print", '("hello")'],
] as const;

export const SHIPPED_PYTHON_SMARTER_HIGHLIGHT_STYLE_BUCKETS = [
  [null],
  [null],
  [null, "syntaxFunction+bold", null],
  [null, "syntaxFunction+italic", null],
] as const;
