import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ClerkProvider } from '@clerk/clerk-react'
import './index.css'
import App from './App.jsx'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if (!PUBLISHABLE_KEY) {
  createRoot(document.getElementById('root')).render(
    <div style={{ padding: '2rem', color: 'red', fontFamily: 'sans-serif' }}>
      <h1>Missing Clerk Publishable Key</h1>
      <p>Please add <code>VITE_CLERK_PUBLISHABLE_KEY=your_key_here</code> to your <code>frontend/.env</code> file.</p>
    </div>
  )
} else {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ClerkProvider>
    </StrictMode>,
  )
}
