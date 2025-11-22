import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: process.env.PORT ? parseInt(process.env.PORT) : 3008,
  },
});
