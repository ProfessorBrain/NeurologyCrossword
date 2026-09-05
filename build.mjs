import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const projectDir = dirname(fileURLToPath(import.meta.url));

await build({
  entryPoints: [join(projectDir, "app.jsx")],
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2020"],
  legalComments: "none",
  outfile: join(projectDir, "app.js"),
});
