function HomePage() {
  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <header>
        <h1>DigitalVision</h1>
        <p className="tagline">
          Camera-based surroundings assistant for visually impaired users
        </p>
      </header>

      <main id="main-content">
        <section className="container" aria-labelledby="status-heading">
          <h2 id="status-heading">Current Status</h2>
          <p>
            <strong>Early development build.</strong> This is a project scaffold
            only. Camera access, object detection, and voice assistance are{' '}
            <strong>not implemented yet</strong> and will be added in later
            development stages.
          </p>
        </section>

        <section className="container" aria-labelledby="features-heading">
          <h2 id="features-heading">Planned Features</h2>
          <ul className="feature-list">
            <li>
              <span className="badge">Planned</span> Camera access — capture
              live video from the device camera
            </li>
            <li>
              <span className="badge">Planned</span> Object detection — identify
              objects and surroundings using a pretrained browser-based model
            </li>
            <li>
              <span className="badge">Planned</span> Spoken descriptions —
              announce detected objects aloud using browser text-to-speech
            </li>
            <li>
              <span className="badge">Planned</span> Text reading (optional) —
              read printed text from camera frames using OCR
            </li>
          </ul>
        </section>

        <section className="container" aria-labelledby="safety-heading">
          <h2 id="safety-heading">Safety Notice</h2>
          <p>
            DigitalVision is an assistive aid under development. It must not be
            relied on for safe movement, obstacle avoidance, or distance
            judgement. Always use established mobility aids and techniques.
          </p>
        </section>
      </main>

      <footer>
        <p>
          DigitalVision — TECH TITANS — HACK ATTACK 2026
        </p>
      </footer>
    </>
  )
}

export default HomePage
