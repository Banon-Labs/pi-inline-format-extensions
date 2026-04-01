import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const extensionsRepoRoot = process.cwd();
const consumerRepoRoot = path.resolve(
  extensionsRepoRoot,
  "..",
  "pi-inline-format",
);
const releaseRepos = [
  {
    label: "extensions",
    repoRoot: extensionsRepoRoot,
    repoSlug: "Banon-Labs/pi-inline-format-extensions",
    packageName: "@banon-labs/pi-inline-format-extensions",
  },
  {
    label: "consumer",
    repoRoot: consumerRepoRoot,
    repoSlug: "Banon-Labs/pi-inline-format",
    packageName: "@banon-labs/pi-inline-format",
  },
];

assert(
  existsSync(consumerRepoRoot),
  `Expected sibling consumer repo at ${consumerRepoRoot}`,
);

const repoChecks = releaseRepos.map((repo) => checkRepo(repo));
const summaries = repoChecks.map((check) => check.summary);
const versions = new Set(repoChecks.map((check) => check.version));
assert.equal(
  versions.size,
  1,
  `Expected both repos to carry the same release version, got: ${repoChecks.map((check) => `${check.packageName}@${check.version}`).join(", ")}`,
);

const bootstrapTokenLine = readBootstrapTokenLine();
const warnings = [];
if (bootstrapTokenLine) {
  warnings.push(
    "warning=bootstrap_token_present ~/.npmrc still contains a registry auth token; remove/revoke it if OIDC trusted publishing is now the only intended release path.",
  );
}

console.log("Release readiness check passed.");
for (const summary of summaries) {
  console.log(summary);
}
for (const warning of warnings) {
  console.log(warning);
}

function checkRepo(repo) {
  const packageJsonPath = path.join(repo.repoRoot, "package.json");
  const workflowPath = path.join(
    repo.repoRoot,
    ".github",
    "workflows",
    "publish-npm.yml",
  );

  assert(
    existsSync(packageJsonPath),
    `Missing package.json: ${packageJsonPath}`,
  );
  assert(existsSync(workflowPath), `Missing publish workflow: ${workflowPath}`);

  const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  assert.equal(
    pkg.name,
    repo.packageName,
    `Unexpected package name in ${packageJsonPath}`,
  );
  assert.equal(
    pkg.publishConfig?.access,
    "public",
    `${repo.packageName} must publish publicly.`,
  );
  assert.equal(
    pkg.publishConfig?.provenance,
    true,
    `${repo.packageName} must keep publishConfig.provenance=true for trusted publishing.`,
  );

  const workflow = readFileSync(workflowPath, "utf8");
  assert(
    workflow.includes("id-token: write"),
    `${workflowPath} must request id-token: write for OIDC trusted publishing.`,
  );
  assert(
    workflow.includes("npm publish --provenance --access public"),
    `${workflowPath} must publish with provenance enabled.`,
  );
  assert(
    workflow.includes("workflow_dispatch"),
    `${workflowPath} must remain manually triggerable for supervised releases.`,
  );
  assert(
    workflow.includes('      - "v*"') || workflow.includes("      - 'v*'"),
    `${workflowPath} must remain tag-triggered for release pushes.`,
  );

  const accessStatus = runCommand("npm", [
    "access",
    "get",
    "status",
    repo.packageName,
  ]).trim();
  assert.equal(
    accessStatus,
    `${repo.packageName}: public`,
    `${repo.packageName} must stay public.`,
  );

  const publishedVersion = runCommand("npm", [
    "view",
    `${repo.packageName}@${pkg.version}`,
    "version",
  ]).trim();
  assert.equal(
    publishedVersion,
    pkg.version,
    `${repo.packageName}@${pkg.version} must resolve from the registry.`,
  );

  return {
    packageName: repo.packageName,
    version: pkg.version,
    summary: [
      `repo=${repo.repoSlug}`,
      `package=${repo.packageName}`,
      `version=${pkg.version}`,
      "workflow=publish-npm.yml",
      "status=public",
      `registry_version=${publishedVersion}`,
    ].join(" "),
  };
}

function runCommand(command, args) {
  return execFileSync(command, args, {
    cwd: extensionsRepoRoot,
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function readBootstrapTokenLine() {
  const npmrcPath = path.join(os.homedir(), ".npmrc");
  if (!existsSync(npmrcPath)) {
    return "";
  }
  return (
    readFileSync(npmrcPath, "utf8")
      .split(/\r?\n/u)
      .find((line) => line.startsWith("//registry.npmjs.org/:_authToken=")) ||
    ""
  );
}
