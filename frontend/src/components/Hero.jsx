import { useEffect, useRef } from 'react'
import { animate, stagger } from 'animejs'
import { Link } from 'react-router-dom'
import { HalftoneCmyk } from '@paper-design/shaders-react'
import BackgroundImg from '../assets/background.png'
import ComputerImg from '../assets/computer.png'
import './Hero.css'

export default function Hero() {
  const illustRef = useRef(null)
  const headingRef = useRef(null)
  const subRef = useRef(null)
  const ctaRef = useRef(null)

  useEffect(() => {
    animate([illustRef.current, headingRef.current, subRef.current, ctaRef.current], {
      opacity: [0, 1],
      translateY: [24, 0],
      duration: 800,
      easing: 'outExpo',
      delay: stagger(120, { start: 200 }),
    })
  }, [])

  return (
    <section className="hero" id="hero">
      {/* Shader background */}
      <div className="hero__bg" aria-hidden="true">
        <HalftoneCmyk
          style={{ width: '100%', height: '100%', display: 'block' }}
          image={BackgroundImg}
          colorBack="#fffaf0"
          colorC="#59afc5"
          colorM="#d8697c"
          colorY="#fad85c"
          colorK="#2d2824"
          size={0.2}
          gridNoise={0.45}
          type="sharp"
          softness={0.4}
          contrast={1.25}
          floodC={0.15}
          floodM={0}
          floodY={0}
          floodK={0}
          gainC={0.3}
          gainM={0}
          gainY={0.2}
          gainK={0}
          grainMixer={0.15}
          grainOverlay={0.1}
          grainSize={0.5}
          fit="cover"
        />
        <div className="hero__overlay" />
      </div>

      {/* Content */}
      <div className="hero__content">

        {/* Hero illustration */}
        <div className="hero__illust" ref={illustRef} style={{ opacity: 0 }} aria-hidden="true">
          <img className="hero__computer" src={ComputerImg} alt="" />
        </div>

        {/* Heading */}
        <h1 className="hero__heading" ref={headingRef} style={{ opacity: 0 }}>
          Commit to live<br />
          in <i>one click.</i>
        </h1>

        {/* Subtitle */}
        <p className="hero__sub" ref={subRef} style={{ opacity: 0 }}>
          Push a GitHub repo. We detect your framework,<br />
          build it, and serve it on a live subdomain.
        </p>

        {/* CTA */}
        <div className="hero__cta" ref={ctaRef} style={{ opacity: 0 }}>
          <Link to="/deploy" className="hero__btn-primary">
            Start Deploying
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M2.5 7h9M8 3.5L11.5 7 8 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>
        </div>
      </div>
    </section>
  )
}
