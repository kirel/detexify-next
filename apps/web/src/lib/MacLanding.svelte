<script lang="ts">
  import macScreenshotUrl from './assets/mac-detexify-screenshot.png'
</script>

<section class="mac-page">
  <div class="mac-intro">
    <div>
      <p class="mac-kicker">macOS menu-bar app</p>
      <p class="mac-lede">One hotkey away.</p>
    </div>
    <p>The Mac build keeps the recognizer close to your editor: offline, compact, and ready to paste the command back into your document.</p>
  </div>

  <div class="mac-showcase" aria-label="Detexify for macOS preview">
    <img
      class="mac-screenshot"
      src={macScreenshotUrl}
      alt="Detexify for macOS recognizing a handwritten alpha-like symbol and showing ranked LaTeX matches"
    />
  </div>

  <div class="mac-details">
    <div>
      <h3>Native where it matters</h3>
      <p>Menu-bar shell, global hotkey, floating panel, and clipboard bridge around the same browser recognizer.</p>
    </div>
    <div>
      <h3>Works offline</h3>
      <p>The bundled web UI and classifier data ship with the app, so recognition does not depend on a network tab.</p>
    </div>
    <div>
      <h3>Open and easy to install</h3>
      <p>The Mac app is built from the same open repository, with releases published where the source and changelog already live.</p>
    </div>
  </div>

  <div class="mac-actions">
    <a class="mac-download-link" href="https://github.com/kirel/detexify-next/releases">Download for Mac</a>
  </div>
</section>
