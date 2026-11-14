import { lstatSync, realpathSync, rmSync, symlinkSync } from "node:fs";
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

// A checked-out symlink can point at a path that exists only on the
// developer's machine. Validate the target, not just the directory entry, and
// recreate it for the current checkout.
if (pathExists(frontendModules)) {
  let pointsAtShared = false;
  try {
    pointsAtShared = realpathSync(frontendModules) === realpathSync(sharedModules);
  } catch {
    pointsAtShared = false;
  }
  if (!pointsAtShared) {
    rmSync(frontendModules, { recursive: true, force: true });
  }
}

if (!pathExists(frontendModules)) {
  // Windows runners disallow symlink without Developer Mode; junction works.
  symlinkSync(sharedModules, frontendModules, process.platform === "win32" ? "junction" : "dir");
}
