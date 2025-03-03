import path from "path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "./app"),
    },
  },

  plugins: [react()],

  build: {
    rollupOptions: {},
  },

  // Kinda weird we ned the .. here. I guess app/ is the root folder. Could use
  // path.join with __dirname to make this clearer.
  publicDir: "../public",
})
