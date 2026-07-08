import { useEffect, useRef, useState } from 'react'
import { animate } from 'animejs'
import { Link, useNavigate } from 'react-router-dom'
import { clearAuthentication, isAuthenticated, subscribeAuthChanges } from '../auth'
import './Navbar.css'

export default function Navbar() {
  const navRef = useRef(null)
  const navigate = useNavigate()
  const [signedIn, setSignedIn] = useState(isAuthenticated())

  useEffect(() => {
    if (navRef.current) {
      animate(navRef.current, {
        opacity: [0, 1],
        translateY: [-16, 0],
        duration: 700,
        easing: 'outExpo',
        delay: 100,
      })
    }

    const onScroll = () => {
      navRef.current?.classList.toggle('nav--scrolled', window.scrollY > 40)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    const unsubscribeAuth = subscribeAuthChanges(() => {
      setSignedIn(isAuthenticated())
    })

    return () => {
      window.removeEventListener('scroll', onScroll)
      unsubscribeAuth()
    }
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
    <nav className="nav" ref={navRef} style={{ opacity: 0 }}>
      <div className="nav__inner">
        {/* Logo */}
        <Link to="/" className="nav__logo">
          <span className="nav__logo-text">W3DEPLOY</span>
        </Link>

        {/* Links */}
        <div className="nav__links">
          <Link to="/deploy" className="nav__link">Deploy</Link>
          <Link to="/deployments" className="nav__link">Deployments</Link>
          <button type="button" className="nav__link nav__link--login nav__link--action" onClick={handleAuthClick}>
            {signedIn ? 'Logout' : 'Login'}
          </button>
        </div>
      </div>
    </nav>
  )
}
