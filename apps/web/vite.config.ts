import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

export default defineConfig({
  // Relative asset paths are required when the built app is loaded from a
  // file:// URL inside the macOS WKWebView bundle.
  base: './',
  plugins: [svelte()],
})
