import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '../', [])
  return {
    plugins: [react()],
    define: {
      'import.meta.env.VITE_USE_LIGHT_THEME': JSON.stringify(env.VITE_USE_LIGHT_THEME || 'false'),
    },
  }
})