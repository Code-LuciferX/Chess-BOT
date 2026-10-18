import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: "node_modules/stockfish/bin/stockfish-19-lite-single.js",
          dest: "engine",
        },
        {
          src: "node_modules/stockfish/bin/stockfish-19-lite-single.wasm",
          dest: "engine",
        },
      ],
    }),
  ],
});
