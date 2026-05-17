#!/usr/bin/env node

import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 8787;
const DEFAULT_MAX_PORT = 8797;
const READY_TIMEOUT_MS = 12_000;
const POLL_INTERVAL_MS = 250;

function parseArgs(argv) {
  const args = {
    host: DEFAULT_HOST,
    port: DEFAULT_PORT,
    maxPort: DEFAULT_MAX_PORT,
    open: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`Missing value after ${item}`);
      return argv[index];
    };

    if (item === "--host") args.host = next();
    else if (item === "--port") args.port = Number.parseInt(next(), 10);
    else if (item === "--max-port") args.maxPort = Number.parseInt(next(), 10);
    else if (item === "--no-open") args.open = false;
    else if (item === "--help" || item === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${item}`);
    }
  }

  if (!Number.isInteger(args.port) || args.port <= 0) throw new Error("--port must be a positive integer.");
  if (!Number.isInteger(args.maxPort) || args.maxPort < args.port) {
    throw new Error("--max-port must be greater than or equal to --port.");
  }

  return args;
}

function printHelp() {
  console.log(`Usage: node start_ui.mjs [options]

Options:
  --host <host>       Bind host, default ${DEFAULT_HOST}
  --port <port>       First port to try, default ${DEFAULT_PORT}
  --max-port <port>   Last port to try, default ${DEFAULT_MAX_PORT}
  --no-open           Do not open the browser automatically
  -h, --help          Show this help
`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchHealth(host, port, timeoutMs = 500) {
  try {
    const response = await fetch(`http://${host}:${port}/api/health`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data?.app === "local-model-bench" ? data : null;
  } catch {
    return null;
  }
}

async function isPortFree(host, port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

async function choosePort({ host, port, maxPort }) {
  for (let currentPort = port; currentPort <= maxPort; currentPort += 1) {
    const health = await fetchHealth(host, currentPort);
    if (health) return { port: currentPort, existing: true };
    if (await isPortFree(host, currentPort)) return { port: currentPort, existing: false };
  }
  throw new Error(`No free port found from ${port} to ${maxPort}.`);
}

function openBrowser(url) {
  const commands = {
    win32: ["cmd", ["/c", "start", "", url]],
    darwin: ["open", [url]],
    linux: ["xdg-open", [url]],
  };
  const command = commands[process.platform];
  if (!command) {
    console.log(`Open this URL in your browser: ${url}`);
    return;
  }

  const child = spawn(command[0], command[1], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.on("error", () => {
    console.log(`Could not open the browser automatically. Open this URL manually: ${url}`);
  });
  child.unref();
}

async function waitUntilReady(host, port, child) {
  const started = Date.now();
  while (Date.now() - started < READY_TIMEOUT_MS) {
    const health = await fetchHealth(host, port, 1_000);
    if (health) return health;
    if (child.exitCode !== null) throw new Error(`UI server exited early with code ${child.exitCode}.`);
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`UI server did not become ready within ${READY_TIMEOUT_MS / 1000} seconds.`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const selected = await choosePort(args);
  const url = `http://${args.host}:${selected.port}`;

  if (selected.existing) {
    console.log(`Local Model Bench is already running: ${url}`);
    if (args.open) openBrowser(url);
    return;
  }

  console.log(`Starting Local Model Bench on ${url}`);
  const child = spawn(process.execPath, ["ui_server.mjs", "--host", args.host, "--port", String(selected.port)], {
    cwd: root,
    stdio: ["ignore", "inherit", "inherit"],
    windowsHide: true,
  });

  let shuttingDown = false;
  const stopServer = (signal = "SIGTERM") => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (child.exitCode === null) child.kill(signal);
  };

  process.on("SIGINT", () => {
    console.log("\nStopping Local Model Bench...");
    stopServer("SIGINT");
  });
  process.on("SIGTERM", () => stopServer("SIGTERM"));
  process.on("exit", () => stopServer("SIGTERM"));

  child.on("exit", (code, signal) => {
    if (!shuttingDown && code !== 0) {
      console.error(`UI server stopped unexpectedly${signal ? ` (${signal})` : ` with code ${code}`}.`);
      process.exitCode = code || 1;
    }
    if (shuttingDown) process.exit(0);
  });

  await waitUntilReady(args.host, selected.port, child);
  console.log(`UI ready: ${url}`);
  if (args.open) openBrowser(url);
  console.log("Press Ctrl+C to stop the server.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
