import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

const PACKAGE_NAME = "@banon-labs/pi-inline-format-extensions";
const PROMPT =
  "Use bash to run python from a heredoc with python3. Use PY as the heredoc delimiter exactly. Keep the transcript inline and normal.";

const repoRoot = process.cwd();
const tempRoot = mkdtempSync(
  path.join(os.tmpdir(), "pi-inline-format-extensions-npm-pack-"),
);
const tarballDir = path.join(tempRoot, "tarballs");
const projectRoot = path.join(tempRoot, "project");
const settingsDir = path.join(projectRoot, ".pi");
const settingsPath = path.join(settingsDir, "settings.json");

mkdirSync(tarballDir, { recursive: true });
mkdirSync(projectRoot, { recursive: true });
mkdirSync(settingsDir, { recursive: true });

try {
  const tarballPath = packPackage(repoRoot, tarballDir);
  installTarball(projectRoot, tarballPath);

  const installedPackagePath = path.join(
    projectRoot,
    "node_modules",
    ...PACKAGE_NAME.split("/"),
  );
  assert(
    existsSync(installedPackagePath),
    `Expected installed package path: ${installedPackagePath}`,
  );

  writeFileSync(
    settingsPath,
    `${JSON.stringify(
      {
        packages: [
          {
            source: installedPackagePath,
            skills: [],
            prompts: [],
            themes: [],
          },
        ],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const listResult = runPi(projectRoot, ["list"]);
  assert(
    listResult.stdout.includes(`Project packages:\n  ${installedPackagePath}`),
    [
      `Expected pi list to report the installed package source ${installedPackagePath}.`,
      "--- stdout ---",
      listResult.stdout.trim(),
    ].join("\n"),
  );
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

console.log(
  [
    "NPM tarball install smoke passed.",
    `package=${PACKAGE_NAME}`,
    `prompt=${PROMPT}`,
  ].join(" "),
);

function packPackage(cwd, outputDir) {
  const result = run(
    "npm",
    ["pack", "--json", "--pack-destination", outputDir],
    cwd,
  );
  const entries = JSON.parse(result.stdout);
  assert(
    Array.isArray(entries) && entries.length > 0,
    "Expected npm pack JSON output.",
  );
  const filename = entries[0]?.filename;
  assert.equal(
    typeof filename,
    "string",
    "Expected npm pack to return a filename.",
  );
  return path.join(outputDir, filename);
}

function installTarball(cwd, tarballPath) {
  writeFileSync(
    path.join(cwd, "package.json"),
    `${JSON.stringify({ name: "tmp-install-check", private: true }, null, 2)}\n`,
    "utf8",
  );
  run("npm", ["install", "--legacy-peer-deps", tarballPath], cwd);
}

function runPi(cwd, args) {
  const command = process.platform === "win32" ? "pi.cmd" : "pi";
  return run(command, args, cwd);
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: process.env,
  });

  if (result.error) {
    throw result.error;
  }

  const warningLines =
    command !== "npm"
      ? []
      : `${result.stdout}\n${result.stderr}`
          .split(/\r?\n/u)
          .map((line) => line.trim())
          .filter((line) => /^npm warn\b/iu.test(line));

  if (result.status !== 0 || warningLines.length > 0) {
    throw new Error(
      [
        `${command} ${args.join(" ")} ${result.status !== 0 ? `exited with status ${String(result.status)}.` : "emitted blocked npm warnings."}`,
        ...(warningLines.length === 0
          ? []
          : ["--- npm warnings ---", ...warningLines]),
        "--- stdout ---",
        result.stdout.trim(),
        "--- stderr ---",
        result.stderr.trim(),
      ].join("\n"),
    );
  }

  return {
    stdout: result.stdout,
    stderr: result.stderr,
  };
}
