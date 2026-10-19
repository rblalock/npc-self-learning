import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({ build:{rollupOptions:{input:{arena:fileURLToPath(new URL('./index.html',import.meta.url)),study:fileURLToPath(new URL('./study.html',import.meta.url))}}} });
