import assert from "node:assert/strict";
import test from "node:test";

import {
  VERBOSE_BASH_SAMPLE_COMMAND,
  VERBOSE_JAVASCRIPT_SAMPLE_COMMAND,
  VERBOSE_PYTHON_SAMPLE_COMMAND,
  VERBOSE_TYPESCRIPT_SAMPLE_COMMAND,
} from "./demo-samples.js";
import { createHostBashRuntime, detectInlineFormatMatches } from "./index.js";

const markerTheme = {
  fg: (color: string, text: string) => `<fg:${color}>${text}</fg>`,
  bold: (text: string) => `<bold>${text}</bold>`,
  italic: (text: string) => `<italic>${text}</italic>`,
  underline: (text: string) => `<underline>${text}</underline>`,
};

const ANSI_PATTERN = /\u001b\[[0-9;]*m/gu;

function renderVerboseBody(command: string, language: string): string[] {
  const { toolDefinition } = createHostBashRuntime();
  assert.ok(toolDefinition.renderCall);

  const rendered = toolDefinition.renderCall(
    { command },
    markerTheme as never,
    {
      executionStarted: false,
      state: {},
    } as never,
  ) as { render(width: number): string[] };

  const match = detectInlineFormatMatches(command).find(
    (candidate) => candidate.language === language,
  );
  assert.ok(match, `expected the verbose ${language} sample to be detected`);

  return rendered
    .render(500)
    .map((line) => line.replaceAll(ANSI_PATTERN, "").trimEnd())
    .slice(match.startLineIndex, match.endLineIndex + 1);
}

test("renders the verbose Python sample with bounded semantic emphasis on declarations and print", () => {
  const body = renderVerboseBody(VERBOSE_PYTHON_SAMPLE_COMMAND, "python");
  const joined = body.join("\n");

  assert.match(
    joined,
    /def <fg:syntaxFunction><bold>main<\/bold><\/fg>\(\) -> None:/u,
  );
  assert.match(
    joined,
    /<fg:syntaxFunction><italic>print<\/italic><\/fg>\("hello from verbose py"/u,
  );
  assert.match(
    joined,
    /def <fg:syntaxFunction><bold>showcase_runtime<\/bold><\/fg>\(\) -> tuple\[bool, str\]:/u,
  );
});

test("renders the verbose JavaScript sample with expected variable, function, and built-in styling", () => {
  const body = renderVerboseBody(
    VERBOSE_JAVASCRIPT_SAMPLE_COMMAND,
    "javascript",
  );
  const joined = body.join("\n");

  assert.match(
    joined,
    /const <fg:syntaxVariable><underline><bold>decimal<\/bold><\/underline><\/fg> = 42;/u,
  );
  assert.match(
    joined,
    /function\* <fg:syntaxFunction><bold>asyncCounter<\/bold><\/fg>/u,
  );
  assert.match(
    joined,
    /<fg:syntaxType><italic>String<\/italic><\/fg>\.<fg:syntaxFunction><italic>raw<\/italic><\/fg>`raw\\n\$\{/u,
  );
});

test("renders the verbose TypeScript sample with expected type and function styling", () => {
  const body = renderVerboseBody(
    VERBOSE_TYPESCRIPT_SAMPLE_COMMAND,
    "typescript",
  );
  const joined = body.join("\n");

  assert.match(
    joined,
    /type <fg:syntaxType><bold>Identifier<\/bold><\/fg> = `item-\$\{number\}`;/u,
  );
  assert.match(
    joined,
    /interface <fg:syntaxType><bold>Entry<\/bold><\/fg><<fg:syntaxType><bold>TValue/u,
  );
  assert.match(
    joined,
    /function <fg:syntaxFunction><bold>formatValue<\/bold><\/fg>\(<fg:syntaxVariable><bold>value/u,
  );
});

test("renders the verbose Bash sample with expected command/function emphasis", () => {
  const body = renderVerboseBody(VERBOSE_BASH_SAMPLE_COMMAND, "bash");
  const joined = body.join("\n");

  assert.match(
    joined,
    /<fg:syntaxFunction><italic>printf<\/italic><\/fg> -v joined "%s:"/u,
  );
  assert.match(
    joined,
    /<fg:syntaxFunction><bold>render_block<\/bold><\/fg>\(\) \{/u,
  );
  assert.match(joined, /<fg:syntaxFunction>mapfile<\/fg> -t records/u);
});
