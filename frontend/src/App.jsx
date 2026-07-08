import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import Background from './components/Background'
import DeployPanel from './components/DeployPanel'
import { isAuthenticated, setAuthenticated } from './auth'
import './App.css'

function getGithubOAuthUrl(nextPath) {
  const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID
  const redirectUri = import.meta.env.VITE_GITHUB_REDIRECT_URI || `${window.location.origin}/login/callback`

  if (!clientId) {
    return ''
  }

  const url = new URL('https://github.com/login/oauth/authorize')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('scope', 'read:user user:email')
  url.searchParams.set('state', nextPath || '/')
  return url.toString()
}

function ProtectedRoute({ children }) {
  const location = useLocation()

  if (!isAuthenticated()) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return children
}

function Home() {
  return (
    <main className="app-main">
      <Hero />
    </main>
  )
}

function Deploy() {
  return (
    <main className="app-main">
      <section id="deploy" className="deploy-section">
        <div className="deploy-section__inner">
          <DeployPanel />
        </div>
      </section>
    </main>
  )
}

function Deployments() {
  return <Placeholder title="Deployments" />
}

function Placeholder({ title }) {
  return (
    <main className="app-main" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '3rem' }}>{title}</h1>
    </main>
  )
}

function Login() {
  const location = useLocation()
  const nextPath = location.state?.from || '/deploy'
  const authUrl = getGithubOAuthUrl(nextPath)

  return (
    <main className="app-main">
      <section className="auth-page">
        <div className="auth-card">
          <p className="auth-card__eyebrow">GitHub required</p>
          <div className="auth-card__icon" aria-hidden="true">
            <img src="/favicon.svg" alt="" className="auth-card__icon-image" />
          </div>
          <h1 className="auth-card__title">Deploy Your First UI</h1>

          <div className="auth-card__actions">
            {authUrl ? (
              <a className="auth-card__button" href={authUrl}>
                Continue with GitHub
              </a>
            ) : (
              <button className="auth-card__button" type="button" disabled>
                Configure VITE_GITHUB_CLIENT_ID
              </button>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}

function GithubCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  useEffect(() => {
    const code = searchParams.get('code')
    const nextPath = searchParams.get('state') || '/deploy'

    if (code) {
      setAuthenticated(true)
      navigate(nextPath, { replace: true })
      return
    }

    navigate('/login', { replace: true })
  }, [navigate, searchParams])

  return (
    <main className="app-main">
      <section className="auth-page">
        <div className="auth-card">
          <p className="auth-card__eyebrow">Connecting GitHub</p>
          <h1 className="auth-card__title">Finishing sign in...</h1>
        </div>
      </section>
    </main>
  )
}

function App() {
  return (
    <>
      <Navbar />
      <Background />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/deploy" element={<ProtectedRoute><Deploy /></ProtectedRoute>} />
        <Route path="/deployments" element={<ProtectedRoute><Deployments /></ProtectedRoute>} />
        <Route path="/login" element={<Login />} />
        <Route path="/login/callback" element={<GithubCallback />} />
      </Routes>
    </>
  )
}

export default App
