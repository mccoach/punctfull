import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "/punctfull/",
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "Markdown 标点全角化转换器",
        short_name: "PunctFull",
        start_url: "/punctfull/",
        scope: "/punctfull/",
        display: "standalone",
        background_color: "#1e1e1e",
        theme_color: "#1e1e1e",
        icons: [
          { src: "/punctfull/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/punctfull/icon-512.png", sizes: "512x512", type: "image/png" }
        ]
      },
      workbox: {
        navigateFallback: "/punctfull/index.html",
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,ttf}"]
      }
    })
  ],
  build: {
    target: "es2020",
    sourcemap: false
  }
});
