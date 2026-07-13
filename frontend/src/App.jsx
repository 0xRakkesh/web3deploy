import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate, useSearchParams, Link } from 'react-router-dom'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import Background from './components/Background'
import DeployPanel from './components/DeployPanel'
import { SignedIn, SignedOut, RedirectToSignIn, useAuth } from '@clerk/clerk-react'
import './App.css'



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
  const { getToken } = useAuth()
  const API = import.meta.env.VITE_API_URL || 'http://localhost:9000'

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const token = await getToken()
        const res = await fetch(`${API}/projects`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })
        const data = await res.json()
        if (data.error) throw new Error(data.error)
        setProjects(data.projects || [])
        setLoading(false)
      } catch (err) {
        setError(err.message)
        setLoading(false)
      }
    }
    fetchProjects()
  }, [getToken])

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



function App() {
  return (
    <>
      <Navbar />
      <Background />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/deploy" element={
          <>
            <SignedIn><Deploy /></SignedIn>
            <SignedOut><RedirectToSignIn /></SignedOut>
          </>
        } />
        <Route path="/deployments" element={
          <>
            <SignedIn><Deployments /></SignedIn>
            <SignedOut><RedirectToSignIn /></SignedOut>
          </>
        } />
      </Routes>
    </>
  )
}

export default App
