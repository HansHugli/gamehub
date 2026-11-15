import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const here = (file: string): string => fileURLToPath(new URL(file, import.meta.url));
const version = (JSON.parse(readFileSync(here("./package.json"), "utf8")) as { version: string }).version;

// One page per game plus the hub. Relative paths, so the site works under any address
// (GitHub Pages serves it from /gamehub/).
export default defineConfig({
  base: "./",
  define: { __VERSION__: JSON.stringify(version) },
  build: {
    target: ["es2020", "safari15"],
    rollupOptions: {
      input: { hub: here("./index.html"), twofold: here("./twofold/index.html"), ladder: here("./ladder/index.html"), balance: here("./balance/index.html") },
    },
  },
});
