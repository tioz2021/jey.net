import { lstatSync, symlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontendRoot = resolve(appRoot, "../../frontend");
const sharedModules = resolve(appRoot, "node_modules");
const frontendModules = resolve(frontendRoot, "node_modules");

// Shared components live outside apps/web. Give TypeScript and Vite one
// dependency tree without maintaining a second node_modules for frontend/.
function pathExists(path) {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

if (!pathExists(frontendModules)) {
  // Windows runners disallow symlink without Developer Mode; junction works.
  symlinkSync(sharedModules, frontendModules, process.platform === "win32" ? "junction" : "dir");
}
