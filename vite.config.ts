import { defineConfig } from "vite";
import pkg from "./package.json" with { type: "json" };
import react from "@vitejs/plugin-react";

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __BUILD_ID__: JSON.stringify(new Date().toISOString()) },
  base: "/truco-arbiser-port/",
  plugins: [react()],
  server: { host: "localhost", port: 3000 },
});
