import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 从环境变量读取后端地址，默认使用 8001 端口
const BACKEND_URL = process.env.VITE_BACKEND_URL || 'http://localhost:8001'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: BACKEND_URL,
        changeOrigin: true
      }
    }
  },
  define: {
    // 注入到前端代码的全局变量
    __BACKEND_URL__: JSON.stringify(BACKEND_URL)
  }
})
