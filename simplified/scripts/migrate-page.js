#!/usr/bin/env node

const { spawnSync } = require("child_process");

function parseArgs(argv) {
  const args = {
    page: "documbox-info",
  };

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--page" && argv[index + 1]) {
      args.page = argv[index + 1];
      index += 1;
    }
  }

  return args;
}

function runStep(scriptName, pageName) {
  const result = spawnSync(process.execPath, [scriptName, "--page", pageName], {
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  runStep("scripts/import-page-from-download.js", args.page);
  const writeResult = spawnSync(
    process.execPath,
    ["scripts/clean-page.js", "--page", args.page, "--write"],
    { stdio: "inherit" }
  );

  if (writeResult.status !== 0) {
    process.exit(writeResult.status ?? 1);
  }

  const checkResult = spawnSync(
    process.execPath,
    ["scripts/clean-page.js", "--page", args.page, "--check"],
    { stdio: "inherit" }
  );

  if (checkResult.status !== 0) {
    process.exit(checkResult.status ?? 1);
  }
}

main();
