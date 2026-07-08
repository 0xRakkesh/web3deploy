import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { clearAuthentication, isAuthenticated, subscribeAuthChanges } from '../auth'
import './Footer.css'

export default function Footer() {
  const year = new Date().getFullYear()
  const navigate = useNavigate()
  const [signedIn, setSignedIn] = useState(isAuthenticated())

  useEffect(() => {
    return subscribeAuthChanges(() => {
      setSignedIn(isAuthenticated())
    })
  }, [])

  const handleAuthClick = () => {
    if (signedIn) {
      clearAuthentication()
      navigate('/', { replace: true })
      return
    }

    navigate('/login')
  }

  return (
    <footer className="footer">
      <div className="footer__inner">
        <div className="footer__brand">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 2L21.5 7.5V16.5L12 22L2.5 16.5V7.5L12 2Z" stroke="var(--accent)" strokeWidth="1.8" fill="none"/>
            <circle cx="12" cy="12" r="3" fill="var(--accent)"/>
          </svg>
          <span className="footer__name">W3DEPLOY</span>
        </div>

        <div className="footer__links">
          <Link to="/deploy">Deploy</Link>
          <Link to="/deployments">Deployments</Link>
          <a href="https://github.com" target="_blank" rel="noopener noreferrer">GitHub</a>
          <button type="button" className="footer__action" onClick={handleAuthClick}>
            {signedIn ? 'Logout' : 'Login'}
          </button>
        </div>

        <p className="footer__copy">© {year} w3deploy. Open source.</p>
      </div>
    </footer>
  )
}
