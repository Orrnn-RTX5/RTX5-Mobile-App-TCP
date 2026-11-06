#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const repositoryRoot = path.resolve(projectRoot, "..");
const toolchainPath = path.join(repositoryRoot, "WORKSPACE_TOOLCHAIN.json");

let tsxCliPath = "";
if (fs.existsSync(toolchainPath)) {
  const toolchain = JSON.parse(fs.readFileSync(toolchainPath, "utf8"));
  const toolRoot = path.join(repositoryRoot, toolchain.jsToolchainDirectory);
  const toolPackagePath = path.join(toolRoot, "node_modules", "tsx", "package.json");
  if (fs.existsSync(toolPackagePath)) {
    const installedVersion = JSON.parse(fs.readFileSync(toolPackagePath, "utf8")).version;
    if (installedVersion !== toolchain.tsx) {
      console.error("The installed tsx version differs from WORKSPACE_TOOLCHAIN.json. Run the setup script.");
      process.exit(1);
    }
    tsxCliPath = require.resolve("tsx/cli", { paths: [toolRoot] });
  }
}

if (!tsxCliPath) {
  try {
    tsxCliPath = require.resolve("tsx/cli", { paths: [projectRoot] });
  } catch {
    console.error("The tsx test runner is missing. Run npm install.");
    process.exit(1);
  }
}

const result = spawnSync(process.execPath, [tsxCliPath, ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
