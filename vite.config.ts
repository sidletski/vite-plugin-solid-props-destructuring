import { defineConfig } from 'vite';
import Inspect from 'vite-plugin-inspect';
import solidPlugin from 'vite-plugin-solid';
import destructurePlugin from './src/plugins/vite-plugin-solid-destructure';

export default defineConfig({
  plugins: [destructurePlugin(), solidPlugin(), Inspect()],
  build: {
    target: 'esnext',
    polyfillDynamicImport: false,
  },
});
