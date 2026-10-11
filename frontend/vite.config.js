
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true
      },
      "/ops/prometheus/ready": {
        target: "http://localhost:9090",
        changeOrigin: true,
        rewrite: () => "/-/ready"
      },
      "/ops/grafana/health": {
        target: "http://localhost:3001",
        changeOrigin: true,
        rewrite: () => "/api/health"
      }
    }
  }
});
