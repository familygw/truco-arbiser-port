import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/truco-arbiser-port/",
  plugins: [react()],
  server: { host: "localhost", port: 3000 },
});
