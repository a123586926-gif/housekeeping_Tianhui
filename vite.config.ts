import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const sandbox = env.VITE_AUTH_SANDBOX === 'enabled'
  // Select a different HTML entry during BUILD so legacy App.tsx is not
  // included in the auth-only QA bundle at all.
  return {
    plugins: [
      react(),
      {
        name: 'housekeeping-auth-sandbox-entry',
        transformIndexHtml(html: string) {
          if (!sandbox) return html
          return html.replace('/src/main.tsx', '/src/authSandboxMain.tsx')
        },
      },
    ],
  }
})
