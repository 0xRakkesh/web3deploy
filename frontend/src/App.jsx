import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate, useSearchParams, Link } from 'react-router-dom'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import Background from './components/Background'
import DeployPanel from './components/DeployPanel'
import { isAuthenticated, setAuthenticated, getToken } from './auth'
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
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const API = import.meta.env.VITE_API_URL || 'http://localhost:9000'

  useEffect(() => {
    fetch(`${API}/projects`, {
      headers: {
        'Authorization': `Bearer ${getToken()}`
      }
    })
      .then(res => res.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        setProjects(data.projects || [])
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  return (
    <main className="app-main" style={{ padding: '8rem 2rem 2rem', minHeight: '100vh', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '2.5rem', marginBottom: '2rem' }}>Your Deployments</h1>
      
      {loading ? (
        <p>Loading projects...</p>
      ) : error ? (
        <p style={{ color: 'var(--text-danger)' }}>Error: {error}</p>
      ) : projects.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', background: 'rgba(0,0,0,0.2)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
          <h2>No deployments yet</h2>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>Start your first project from the deployment panel.</p>
          <Link to="/deploy" className="auth-card__button" style={{ display: 'inline-block', marginTop: '1.5rem', width: 'auto', padding: '0.75rem 1.5rem' }}>Deploy a Project</Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
          {projects.map(p => (
            <div key={p.id} style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '1.5rem', backdropFilter: 'blur(10px)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.25rem' }}>{p.project_id}</h3>
                <span style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.1)', padding: '0.25rem 0.5rem', borderRadius: '4px' }}>{p.framework}</span>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1.5rem', wordBreak: 'break-all' }}>
                {p.github_repo}
              </p>
              <a 
                href={`https://${p.project_id}.web3deploy.me`} 
                target="_blank" 
                rel="noopener noreferrer"
                className="auth-card__button"
                style={{ textAlign: 'center', background: '#fff', color: '#0e1a0e' }}
              >
                Visit Site
              </a>
            </div>
          ))}
        </div>
      )}
    </main>
  )
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
  const [error, setError] = useState(null)
  const API = import.meta.env.VITE_API_URL || 'http://localhost:9000'

  useEffect(() => {
    const code = searchParams.get('code')
    const nextPath = searchParams.get('state') || '/deploy'

    if (!code) {
      navigate('/login', { replace: true })
      return
    }

    fetch(`${API}/auth/github`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    })
      .then(res => res.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        if (data.token) {
          setAuthenticated(data.token)
          navigate(nextPath, { replace: true })
        }
      })
      .catch(err => {
        console.error('Auth error', err)
        setError(err.message)
      })
  }, [navigate, searchParams])

  return (
    <main className="app-main">
      <section className="auth-page">
        <div className="auth-card">
          <p className="auth-card__eyebrow">Connecting GitHub</p>
          <h1 className="auth-card__title">
            {error ? 'Authentication failed' : 'Finishing sign in...'}
          </h1>
          {error && <p style={{ color: 'var(--text-danger)', marginTop: '1rem' }}>{error}</p>}
          {error && (
            <Link to="/login" className="auth-card__button" style={{ marginTop: '1rem', display: 'inline-block' }}>
              Try Again
            </Link>
          )}
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
