// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * `npm run pod`: the Community Solid Server the tests run (servers/css-7),
 * in memory, at http://127.0.0.1:3999/, to poke at by hand or run the
 * end-to-end tests against with SOLID_SERVER_URL=http://127.0.0.1:3999/.
 * Anyone may read and write it: keep no real data in it. Ctrl-C stops it,
 * and its container and data go.
 */
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { composeFile } from "./servers.ts";

const compose = ["compose", "-p", "solid-memo-pod", "-f", composeFile("css-7")];
const env = { ...process.env, E2E_PORT: "3999", E2E_SECRET: randomUUID() };
// Ctrl-C reaches compose too, which stops the server; then it is taken down.
process.on("SIGINT", () => {});
const server = spawn("docker", [...compose, "up", "--pull", "missing"], { stdio: "inherit", env });
server.on("exit", (code) => {
  spawnSync("docker", [...compose, "down", "-v", "-t", "0"], { stdio: "inherit", env });
  process.exit(code ?? 0);
});
