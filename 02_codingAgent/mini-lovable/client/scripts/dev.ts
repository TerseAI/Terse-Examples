/** Run the backend and the Vite app together; when either exits, stop both. Editing .env restarts both. */
import { spawn, type Subprocess } from "bun";
import { watch } from "node:fs";
import path from "node:path";

// Run with --no-env-file so each child reads .env fresh instead of inheriting stale values.
const root = path.join(import.meta.dir, "..");

let children: Subprocess[] = [];
let restarting = Promise.resolve();
let debounce: Timer | undefined;

function start() {
  const current = [
    spawn(["bun", "run", "dev:backend"], { cwd: root, stdio: ["ignore", "inherit", "inherit"] }),
    spawn(["bun", "run", "dev:web"], { cwd: root, stdio: ["inherit", "inherit", "inherit"] }),
  ];
  children = current;
  void Promise.race(current.map(child => child.exited)).then(code => {
    if (children !== current) return;
    stop();
    process.exit(code);
  });
}

function stop() {
  for (const child of children) child.kill();
}

async function restart() {
  const previous = children;
  children = [];
  for (const child of previous) child.kill();
  await Promise.all(previous.map(child => child.exited));
  console.log("\n.env changed, restarting the backend and Vite\n");
  start();
}

// Watch the directory, not the file: editors often save by replacing it.
watch(root, (_event, file) => {
  if (file !== ".env") return;
  clearTimeout(debounce);
  debounce = setTimeout(() => { restarting = restarting.then(restart); }, 200);
});

process.on("SIGINT", stop);
process.on("SIGTERM", stop);

start();
