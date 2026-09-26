"use strict";
const { spawn } = require("node:child_process");
const path = require("node:path");
const { createGameServer } = require("../../server.js");

async function main() {
  const { server, shutdown } = createGameServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  try {
    const cli = path.join(path.dirname(require.resolve("playwright/package.json")), "cli.js");
    const child = spawn(process.execPath, [cli, "test", ...process.argv.slice(2)], {
      stdio: "inherit",
      env: { ...process.env, TEST_PORT: String(server.address().port) },
    });
    process.exitCode = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code) => resolve(code ?? 1));
    });
  } finally {
    shutdown();
    await new Promise((resolve) => server.once("close", resolve));
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
