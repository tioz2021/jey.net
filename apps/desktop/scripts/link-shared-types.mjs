// The desktop app and the web app share React components. TypeScript treats
// two physical copies of @types/react as different types, so point the desktop
// install at the web install when both exist.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appTypes = path.resolve(here, "../node_modules/@types");
const webTypes = path.resolve(here, "../../../frontend/node_modules/@types");

for (const name of ["react", "react-dom"]) {
  const source = path.join(webTypes, name);
  const target = path.join(appTypes, name);
  if (!fs.existsSync(source)) continue;
  fs.rmSync(target, { recursive: true, force: true });
  fs.symlinkSync(source, target, "junction");
}
