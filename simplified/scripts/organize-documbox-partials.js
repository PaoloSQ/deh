#!/usr/bin/env node

const path = require("path");
const { spawnSync } = require("child_process");

const result = spawnSync(
  process.execPath,
  [path.join(__dirname, "organize-page-partials.js"), "--page", "documbox-info"],
  { stdio: "inherit" }
);

process.exit(result.status ?? 0);
