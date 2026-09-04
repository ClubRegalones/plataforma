import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import packageJson from './package.json' with { type: 'json' }

export default defineConfig({
  envDir: '../..',
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  server: {
    port: 5174,
    strictPort: true,
  },
})
