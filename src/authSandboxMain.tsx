import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Preview-only original UI regression entry. App.tsx now uses server sessions and\n// protected business APIs; the production entry and database remain unchanged.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
