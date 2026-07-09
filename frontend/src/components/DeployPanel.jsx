import { useState, useEffect, useRef } from 'react'
import { animate, stagger } from 'animejs'
import './DeployPanel.css'

const API = import.meta.env.VITE_API_URL || 'http://localhost:9000'

export default function DeployPanel() {
  const [projectId, setProjectId] = useState('')
  const [repoUrl, setRepoUrl] = useState('')
  const [rootDir, setRootDir] = useState('')
  const [framework, setFramework] = useState('')
  const [installCommand, setInstallCommand] = useState('')
  const [buildCommand, setBuildCommand] = useState('')
  const [outputDir, setOutputDir] = useState('')
  const [envVars, setEnvVars] = useState('')

  const [showAdvanced, setShowAdvanced] = useState(false)
  const [logs, setLogs] = useState([])
  const [status, setStatus] = useState('idle') // idle | building | done | error
  const [previewUrl, setPreviewUrl] = useState('')

  const panelRef = useRef(null)
  const formRef = useRef(null)
  const termRef = useRef(null)
  const logEndRef = useRef(null)

  // Entrance animation
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return

    animate(panel, {
      opacity: [0, 1],
      translateY: [40, 0],
      duration: 900,
      easing: 'outExpo',
      delay: 300,
    })

    // Stagger form fields
    const fields = formRef.current?.querySelectorAll('.field, .form-actions')
    if (fields) {
      animate(fields, {
        opacity: [0, 1],
        translateY: [16, 0],
        duration: 600,
        easing: 'outExpo',
        delay: stagger(80, { start: 500 }),
      })
    }

    // Terminal entrance
    const term = termRef.current
    if (term) {
      animate(term, {
        opacity: [0, 1],
        translateX: [30, 0],
        duration: 800,
        easing: 'outExpo',
        delay: 600,
      })
    }
  }, [])

  // Auto-scroll logs
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  // Animate new log lines
  useEffect(() => {
    if (logs.length === 0) return
    const container = termRef.current?.querySelector('.term-body')
    if (!container) return
    const lastLine = container.lastElementChild
    if (lastLine) {
      animate(lastLine, {
        opacity: [0, 1],
        translateX: [-8, 0],
        duration: 300,
        easing: 'outQuad',
      })
    }
  }, [logs.length])

  const handleDeploy = async (e) => {
    e.preventDefault()
    if (!projectId || !repoUrl || status === 'building') return

    setStatus('building')
    setLogs([])
    setPreviewUrl('')

    try {
      const body = { projectId, gitRepoUrl: repoUrl }
      if (rootDir) body.rootDir = rootDir
      if (framework) body.framework = framework
      if (installCommand) body.installCommand = installCommand
      if (buildCommand) body.buildCommand = buildCommand
      if (outputDir) body.outputDir = outputDir
      if (envVars) body.envVars = envVars

      const res = await fetch(`${API}/project`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to start build')

      setPreviewUrl(data.previewUrl || `https://${projectId}.web3deploy.me`)

      // SSE log stream
      const es = new EventSource(`${API}/project/${projectId}/logs`)

      es.onmessage = (event) => {
        try {
          const { log } = JSON.parse(event.data)
          setLogs(prev => [...prev, log])

          // Pick up the deployed URL published by the build-server
          if (log.startsWith('Deployed: ')) {
            setPreviewUrl(log.replace('Deployed: ', '').trim())
          }

          if (log.trim() === 'Done') {
            setStatus('done')
            es.close()
          } else if (/^error:/i.test(log.trim())) {
            setStatus('error')
            es.close()
          }
        } catch (err) {
          console.error('SSE parse error', err)
          setLogs(prev => [...prev, event.data])
        }
      }

      es.onerror = () => {
        setLogs(prev => [...prev, 'Connection lost.'])
        setStatus('error')
        es.close()
      }
    } catch (err) {
      setLogs(prev => [...prev, `error: ${err.message}`])
      setStatus('error')
    }
  }

  const slugify = (v) => v.toLowerCase().replace(/[^a-z0-9-]/g, '')

  return (
    <div className="deploy-panel" ref={panelRef} style={{ opacity: 0 }}>

      {/* ── Left: Form ── */}
      <form className="deploy-form glass" onSubmit={handleDeploy} ref={formRef}>
        <div className="form-header">
          <h2 className="form-title">New Deployment</h2>
          <p className="form-sub">Connect a repository to deploy</p>
        </div>

        <div className="field">
          <label htmlFor="dp-id">Project ID</label>
          <input
            id="dp-id"
            type="text"
            value={projectId}
            onChange={e => setProjectId(slugify(e.target.value))}
            placeholder="my-portfolio"
            required
            disabled={status === 'building'}
          />
        </div>

        <div className="field">
          <label htmlFor="dp-repo">GitHub URL</label>
          <input
            id="dp-repo"
            type="url"
            value={repoUrl}
            onChange={e => setRepoUrl(e.target.value)}
            placeholder="https://github.com/user/repo"
            required
            disabled={status === 'building'}
          />
        </div>

        <div className="field">
          <label htmlFor="dp-env">ENV</label>
          <textarea
            id="dp-env"
            value={envVars}
            onChange={e => setEnvVars(e.target.value)}
            placeholder="Warning: Variables injected here will be visible in the deployed static site. Do not include secret API keys."
            disabled={status === 'building'}
            rows={3}
            style={{
              background: 'rgba(0, 0, 0, 0.25)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '6px',
              padding: '0.55rem 0.75rem',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.85rem',
              outline: 'none',
              resize: 'vertical'
            }}
          />
        </div>

        {/* Advanced toggle */}
        <button
          type="button"
          className="advanced-toggle"
          onClick={() => setShowAdvanced(v => !v)}
          aria-expanded={showAdvanced}
        >
          <span className={`chevron ${showAdvanced ? 'open' : ''}`}>▸</span>
          Advanced Settings
        </button>

        {showAdvanced && (
          <div className="advanced-fields">
            <div className="field field-sm">
              <label htmlFor="dp-root">Root Directory</label>
              <input id="dp-root" type="text" value={rootDir} onChange={e => setRootDir(e.target.value)} placeholder="e.g. frontend" disabled={status === 'building'} />
            </div>
            <div className="field field-sm">
              <label htmlFor="dp-fw">Framework</label>
              <input id="dp-fw" type="text" value={framework} onChange={e => setFramework(e.target.value)} placeholder="Auto-detected" disabled={status === 'building'} />
            </div>
            <div className="field field-sm">
              <label htmlFor="dp-install">Install Command</label>
              <input id="dp-install" type="text" value={installCommand} onChange={e => setInstallCommand(e.target.value)} placeholder="npm install" disabled={status === 'building'} />
            </div>
            <div className="field field-sm">
              <label htmlFor="dp-build">Build Command</label>
              <input id="dp-build" type="text" value={buildCommand} onChange={e => setBuildCommand(e.target.value)} placeholder="npm run build" disabled={status === 'building'} />
            </div>
            <div className="field field-sm">
              <label htmlFor="dp-out">Output Directory</label>
              <input id="dp-out" type="text" value={outputDir} onChange={e => setOutputDir(e.target.value)} placeholder="dist" disabled={status === 'building'} />
            </div>
          </div>
        )}

        <div className="form-actions" style={{ display: 'flex', gap: '1rem' }}>
          <button type="submit" className="deploy-btn" disabled={status === 'building'} style={{ flex: 1 }}>
            {status === 'building' ? (
              <><span className="spinner" /> Deploying...</>
            ) : status === 'done' ? (
              <>Redeploy <span className="arrow">↻</span></>
            ) : (
              <>Deploy Now <span className="arrow">→</span></>
            )}
          </button>
          
          {status === 'done' && previewUrl && (
            <a 
              href={previewUrl} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="deploy-btn" 
              style={{ flex: 1, textDecoration: 'none', background: '#fff', color: '#0e1a0e', border: '2.5px solid #0e1a0e' }}
            >
              Visit <span className="arrow">↗</span>
            </a>
          )}
        </div>
      </form>

      {/* ── Right: Terminal ── */}
      <div className="terminal glass" ref={termRef} style={{ opacity: 0 }}>
        <div className="term-chrome">
          <div className="term-dots">
            <span className="td td-r" />
            <span className="td td-y" />
            <span className="td td-g" />
          </div>
          <span className="term-title">Build Logs</span>
          <div className={`term-status s-${status}`}>
            <span className="s-dot" />
            {status === 'idle' ? 'IDLE' : status === 'building' ? 'BUILDING' : status === 'done' ? 'LIVE' : 'ERROR'}
          </div>
        </div>

        <div className="term-body">
          {logs.length === 0 && status === 'idle' && (
            <div className="term-empty">
              <span className="term-cursor-block">▊</span> Waiting for deployment...
            </div>
          )}

          {logs.map((log, i) => (
            <div
              key={i}
              className={`log-line ${log.toLowerCase().startsWith('error') ? 'log-err' : ''} ${log.startsWith('─') ? 'log-divider' : ''} ${log.startsWith('  ') ? 'log-indent' : ''}`}
            >
              {log}
            </div>
          ))}

          {status === 'done' && previewUrl && (
            <div className="log-success">
              <span className="check">✓</span>
              Live at{' '}
              <a href={previewUrl} target="_blank" rel="noopener noreferrer">{previewUrl}</a>
            </div>
          )}

          <div ref={logEndRef} />
        </div>
      </div>
    </div>
  )
}
