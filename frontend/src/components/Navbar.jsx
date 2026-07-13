import { useEffect, useRef, useState } from 'react'
import { animate } from 'animejs'
import { Link, useNavigate } from 'react-router-dom'
import { SignedIn, SignedOut, UserButton, SignInButton } from '@clerk/clerk-react'
import './Navbar.css'

export default function Navbar() {
  const navRef = useRef(null)

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
    return () => {
      window.removeEventListener('scroll', onScroll)
    }
  }, [])

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
          <SignedIn>
            <UserButton afterSignOutUrl="/" />
          </SignedIn>
          <SignedOut>
            <SignInButton mode="modal">
              <button type="button" className="nav__link nav__link--login nav__link--action">
                Login
              </button>
            </SignInButton>
          </SignedOut>
        </div>
      </div>
    </nav>
  )
}
