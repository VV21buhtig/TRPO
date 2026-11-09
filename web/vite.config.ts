import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const apiProxy = {
  '/api': {
    target: 'http://127.0.0.1:5080',
    changeOrigin: true,
  },
  '/hubs': {
    target: 'http://127.0.0.1:5080',
    changeOrigin: true,
    ws: true,
  },
  '/swagger': {
    target: 'http://127.0.0.1:5080',
    changeOrigin: true,
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    allowedHosts: ['.tuna.am', '.tuna.free', '.2na.am', '.lhr.life', '.serveo.net', '.serveousercontent.com'],
    proxy: apiProxy,
  },
  preview: {
    host: true,
    allowedHosts: ['.tuna.am', '.tuna.free', '.2na.am', '.lhr.life', '.serveo.net', '.serveousercontent.com'],
    proxy: apiProxy,
  },
})
