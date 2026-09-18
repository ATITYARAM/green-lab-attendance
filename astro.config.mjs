import { defineConfig } from "astro/config";

export default defineConfig({
  output: "static",
  site: "https://rakhuljm.github.io",
  base: "/green-lab-attendance",
  outDir: "./docs",
  publicDir: "./public",
  build: {
    format: "file"
  }
});
