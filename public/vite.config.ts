import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/nom-du-repo/", // remplace par le nom exact de ton dépôt
});
