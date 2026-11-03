import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Select the auth-only entry based on Vercel's trusted git branch metadata,
// rather than trusting only a branch-scoped VITE_ environment variable.
// Fail closed: never bundle the legacy browser-side PIN UI into a feature
// preview when the auth sandbox was requested but branch metadata is missing.
export default defineConfig(({ mode }) => {
  const loaded = loadEnv(mode, process.cwd(), 'VITE_')
  const vercelEnvironment = process.env.VERCEL_ENV
  const ref = process.env.VERCEL_GIT_COMMIT_REF
  const sandboxRequested =
    (process.env.VITE_AUTH_SANDBOX ?? loaded.VITE_AUTH_SANDBOX) === 'enabled'
  const isFeatureBranch = ref === 'feature/remember-login-30d'

  if (vercelEnvironment === 'production' && sandboxRequested) {
    throw new Error('Auth sandbox cannot run in production')
  }
  if (vercelEnvironment === 'preview' && sandboxRequested && !isFeatureBranch) {
    throw new Error('Auth sandbox requested outside the permitted feature branch')
  }
  const sandbox = vercelEnvironment === 'preview'
    ? isFeatureBranch
    : !vercelEnvironment && sandboxRequested

  // No secret values in logs.
  console.log(`[housekeeping-build] Vercel environment: ${vercelEnvironment || 'local'}; feature branch: ${isFeatureBranch}; sandbox: ${sandbox}`)

  return {
    plugins: [
      react(),
      {
        name: 'housekeeping-auth-sandbox-entry',
        enforce: 'pre' as const,
        transformIndexHtml: {
          order: 'pre' as const,
          handler(html: string) {
            if (!sandbox) return html
            if (!html.includes('/src/main.tsx')) {
              throw new Error('Original HTML entry missing, cannot switch to isolated auth sandbox')
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
