import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import AuthSandbox from './AuthSandbox'
import './index.css'

// Deliberately OFF by default. Only enable on a disposable Vercel Preview
// connected to a separate TEST Supabase project. Do not enable in Production.
// When enabled, the normal Housekeeping App is not mounted at all.
const authSandboxEnabled = import.meta.env.VITE_AUTH_SANDBOX === 'enabled'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {authSandboxEnabled ? <AuthSandbox /> : <App />}
  </React.StrictMode>,
)
