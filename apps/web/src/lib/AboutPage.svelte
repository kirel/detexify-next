<section class="about-page">
  <div class="about-lede">
    <p class="about-kicker">From thesis to rebuild</p>
    <h2>Detexify started as my diploma thesis.</h2>
    <p>
      The original version grew out of a simple frustration: finding a LaTeX symbol is hard when
      you know what it looks like but not what it is called. Philipp Kuehl had the initial idea,
      and I built the first Detexify around it.
    </p>
  </div>

  <div class="about-story">
    <p>
      That first stack was very much a product of its time: a Ruby web frontend and a Haskell
      backend, with training tools that worked, but were stitched together from whatever was
      practical at the time. The public Detexify frontend dates back to 2009, the Haskell backend
      followed in 2010, and the training data was later published separately in 2014.
    </p>
    <p>
      Then life happened. Mostly two children happened. The site kept being useful, but the stack
      aged until running it locally became harder than maintaining the idea itself.
    </p>
    <p>
      In 2026, AI-assisted coding made the rewrite feel small enough to actually do. Detexify Next
      is a modern TypeScript/Svelte/macOS rebuild, vibe-coded over two evenings, but with the parts
      that matter made more maintainable: source data, training workflows, validation, preview
      tooling, and contributor documentation.
    </p>
  </div>

  <div class="about-timeline" aria-label="Detexify timeline">
    <div>
      <span>2009</span>
      <p>Public Detexify frontend starts on GitHub.</p>
    </div>
    <div>
      <span>2010</span>
      <p>Haskell backend becomes the recognizer service.</p>
    </div>
    <div>
      <span>2014</span>
      <p>Training data gets its own public repository.</p>
    </div>
    <div>
      <span>2026</span>
      <p>Detexify Next rebuilds the project on a modern client-side stack.</p>
    </div>
  </div>

  <div class="about-details">
    <section>
      <h3>Built to be contributed to</h3>
      <p>Symbols and handwriting samples now have a clearer path: source files, validation, preview artifacts, and contribution docs instead of fragile one-off scripts.</p>
    </section>
    <section>
      <h3>Client-side by default</h3>
      <p>The recognizer runs in the browser, so normal usage has essentially no server cost. Donations may come later, but the project no longer needs a backend just to classify a drawing.</p>
    </section>
    <section>
      <h3>Mac app included</h3>
      <p>The new macOS menu-bar app is planned as a free companion: one hotkey, offline recognition, and direct clipboard integration for LaTeX commands.</p>
    </section>
  </div>
</section>
