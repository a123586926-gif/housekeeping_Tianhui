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
  const releaseReady = process.env.HOUSEKEEPING_RELEASE_READY === 'enabled'
  const isQaBranch = ref === 'feature/remember-login-30d' ||
    ref === 'integration/full-release-review-20261105'

  if (vercelEnvironment === 'production' && (!releaseReady || ref !== 'main' || sandboxRequested)) {
    throw new Error('Production release requires explicit readiness and main branch')
  }
  if (vercelEnvironment === 'preview' && sandboxRequested && !isQaBranch) {
    throw new Error('Auth sandbox requested outside the permitted QA branches')
  }
  const sandbox = vercelEnvironment === 'preview'
    ? isQaBranch
    : !vercelEnvironment && sandboxRequested

  // No secret values in logs.
  console.log(`[housekeeping-build] Vercel environment: ${vercelEnvironment || 'local'}; QA branch: ${isQaBranch}; sandbox: ${sandbox}`)

  return {
    define: { 'import.meta.env.VITE_HK_RELEASE_APPROVED': JSON.stringify(vercelEnvironment === 'production' && releaseReady && ref === 'main' ? 'enabled' : 'disabled') },
    plugins: [
      react(),
      {
        name: 'housekeeping-auth-sandbox-entry',
        enforce: 'pre' as const,
        transformIndexHtml: {
          order: 'pre' as const,
          handler(html: string) {
            // The isolated feature branch already has a dedicated sandbox
            // entry in index.html. Treat that as valid rather than failing
            // when build metadata starts working as intended.
            if (html.includes('/src/authSandboxMain.tsx')) {
              if (vercelEnvironment === 'production' && (!releaseReady || ref !== 'main')) {
                throw new Error('Protected app entry requires approved production release')
              }
              if (vercelEnvironment === 'preview' && !isQaBranch) {
                throw new Error('Auth sandbox HTML is limited to the QA branches')
              }
              return html
            }
            if (!sandbox) return html
            if (!html.includes('/src/main.tsx')) {
              throw new Error('Expected either original or sandbox HTML entry')
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
