#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createServer } from "node:net";

async function randomAvailablePort() {
  const server = createServer();

  return await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        if (!address || typeof address === "string") {
          reject(new Error("Could not resolve random server port"));
          return;
        }

        resolve(address.port);
      });
    });
  });
}

function usesServeListenFlag(command, args) {
  return command === "serve" || (command === "pnpm" && args[0] === "exec" && args[1] === "serve");
}

async function resolveAutoPortArgs(command, args) {
  const nextArgs = [...args];
  const serveListenFlag = usesServeListenFlag(command, args);

  for (let index = 0; index < nextArgs.length; index += 1) {
    const arg = nextArgs[index];

    if ((arg === "--port" || arg === "-p") && nextArgs[index + 1] === "auto") {
      const port = await randomAvailablePort();
      nextArgs[index] = serveListenFlag ? "--listen" : arg;
      nextArgs[index + 1] = String(port);
      console.error(`Using random available port ${port}`);
      return nextArgs;
    }

    if (arg === "--port=auto" || arg === "-p=auto") {
      const port = await randomAvailablePort();
      const [flag] = arg.split("=");
      nextArgs[index] = serveListenFlag ? `--listen=${port}` : `${flag}=${port}`;
      console.error(`Using random available port ${port}`);
      return nextArgs;
    }
  }

  return nextArgs;
}

async function main() {
  const [command, ...rawArgs] = process.argv.slice(2);

  if (!command) {
    console.error("Usage: node scripts/dev-server.mjs <command> [...args]");
    process.exit(1);
  }

  const args = await resolveAutoPortArgs(command, rawArgs);
  const child = spawn(command, args, {
    env: process.env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      child.kill(signal);
    });
  }

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 1);
  });

  child.on("error", (error) => {
    console.error(error);
    process.exit(1);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
