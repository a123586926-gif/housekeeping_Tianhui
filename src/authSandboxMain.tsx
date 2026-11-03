import React from 'react'
import ReactDOM from 'react-dom/client'
import AuthSandbox from './AuthSandbox'
import './index.css'

// Dedicated Preview QA entry: no imports from Housekeeping's legacy App.tsx.
// This prevents bundling the original browser PIN and business-data code.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthSandbox />
  </React.StrictMode>,
)
