import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Keep the QA entry isolated from the legacy app. Vite's HTML transform
// MUST run before its own HTML module import discovery (order: 'pre').
export default defineConfig(({ mode }) => {
  const localEnv = loadEnv(mode, process.cwd(), 'VITE_')
  const requestedSandbox =
    (process.env.VITE_AUTH_SANDBOX ?? localEnv.VITE_AUTH_SANDBOX) === 'enabled'
  const isProduction = process.env.VERCEL_ENV === 'production'
  const sandbox = requestedSandbox && !isProduction

  if (requestedSandbox && isProduction) {
    throw new Error('Auth sandbox must never be enabled on Production')
  }

  // This message is safe: never log API keys, tokens, or variable values.
  console.log(`[housekeeping-build] mode=${mode}; auth-only sandbox=${sandbox ? 'on' : 'off'}`)

  return {
    plugins: [
      react(),
      {
        name: 'housekeeping-auth-sandbox-entry',
        transformIndexHtml: {
          order: 'pre' as const,
          handler(html: string) {
            if (!sandbox) return html
            if (!html.includes('/src/main.tsx')) {
              throw new Error('Unable to find original application entry in index.html')
            }
            return html
              .replace('/src/main.tsx', '/src/authSandboxMain.tsx')
              .replace('天惠會館房務管理系統', '天惠會館｜30 天登入驗證')
          },
        },
      },
    ],
  }
})
