<script lang="ts">
  import type { Strokes } from '@detexify/core'
  import DrawingCanvas from './lib/DrawingCanvas.svelte'
  import ResultsList from './lib/ResultsList.svelte'
  import SymbolGallery from './lib/SymbolGallery.svelte'
  import MacLanding from './lib/MacLanding.svelte'
  import LegalNotice from './lib/LegalNotice.svelte'
  import TrainingView from './lib/TrainingView.svelte'
  import BenchmarkView from './lib/BenchmarkView.svelte'
  import type { EnrichedResult, WorkerResponse, WorkerStatus } from './lib/types.js'

  let strokes: Strokes = $state([])
  let results: EnrichedResult[] = $state([])
  let status: WorkerStatus = $state('idle')
  let statusMessage = $state('Starting…')
  let stats = $state('')
  let copied = $state('')
  let copyError = $state('')
  let copiedPulse = $state(0)
  let resultLimit = $state(10)
  const isNativeShell = window.location.protocol === 'detexify:'
  const canTrain = import.meta.env.DEV && !isNativeShell
  const canBenchmark = import.meta.env.DEV && !isNativeShell
  let route = $state(routeFromHash())
  const hasInk = $derived(strokes.length > 0)
  const visibleResults = $derived(results.slice(0, resultLimit))
  const canShowMore = $derived(!isNativeShell && results.length > visibleResults.length)

  if (isNativeShell) document.documentElement.classList.add('native-shell')
  const worker = new Worker(new URL('./workers/classifier.worker.ts', import.meta.url), { type: 'module' })

  window.addEventListener('message', (event: MessageEvent) => {
    if (event.data?.type === 'clear') clear()
  })

  window.addEventListener('hashchange', () => {
    route = routeFromHash()
  })

  window.addEventListener('keydown', (event: KeyboardEvent) => {
    if (route !== 'draw') return
    if (event.key === 'Backspace' || event.key === 'Delete') {
      const target = event.target
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target instanceof HTMLElement && target.isContentEditable) return
      event.preventDefault()
      clear()
    }
  })

  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const message = event.data
    if (message.type === 'status') {
      status = message.status
      statusMessage = message.message ?? message.status
    } else if (message.type === 'loaded') {
      status = 'ready'
      stats = `${message.symbolCount} symbols, ${message.sampleCount} samples`
      classify()
    } else if (message.type === 'results') {
      results = message.results
      statusMessage = `Classified in ${message.durationMs.toFixed(1)} ms`
    } else if (message.type === 'error') {
      status = 'error'
      statusMessage = message.message
    }
  }

  const appBase = import.meta.env.BASE_URL
  worker.postMessage({
    type: 'load',
    snapshotUrl: new URL(`${appBase}data/snapshot.json`, window.location.href).href,
    symbolsUrl: new URL(`${appBase}data/symbols.json`, window.location.href).href,
  })

  function routeFromHash() {
    if (window.location.hash === '#/symbols') return 'symbols'
    if (window.location.hash === '#/mac' && !isNativeShell) return 'mac'
    if (window.location.hash === '#/impressum' && !isNativeShell) return 'impressum'
    if (window.location.hash === '#/train' && canTrain) return 'train'
    if (window.location.hash === '#/bench' && canBenchmark) return 'bench'
    return 'draw'
  }

  function onStrokeEnd(nextStrokes: Strokes) {
    strokes = nextStrokes
    resultLimit = 10
    classify()
  }

  function classify() {
    if (strokes.length === 0 || status === 'loading' || status === 'idle') return
    worker.postMessage({ type: 'classify', strokes: cloneStrokes(strokes), limit: 50 })
  }

  function cloneStrokes(value: Strokes): Strokes {
    return value.map((stroke) => stroke.map((point) => ({ x: point.x, y: point.y })))
  }

  function clear() {
    strokes = []
    results = []
    copied = ''
    resultLimit = 10
  }

  async function copyResult(result: EnrichedResult) {
    const command = result.symbol?.command ?? result.id
    const native = (window as typeof window & { webkit?: { messageHandlers?: { detexifyNative?: { postMessage: (message: unknown) => void } } } }).webkit?.messageHandlers?.detexifyNative
    try {
      if (native) native.postMessage({ type: 'copy', text: command })
      else await navigator.clipboard.writeText(command)
      copyError = ''
      copied = command
      copiedPulse += 1
      const pulse = copiedPulse
      setTimeout(() => {
        if (copiedPulse === pulse) copied = ''
      }, 1900)
    } catch (error) {
      copied = ''
      copyError = error instanceof Error ? error.message : 'Could not copy to clipboard'
      setTimeout(() => {
        copyError = ''
      }, 2600)
    }
  }
</script>

<main class="shell" class:web={!isNativeShell} class:native={isNativeShell}>
  <section class="hero">
    <p class="eyebrow">Detexify</p>
    <h1>{route === 'symbols' ? 'Symbol table.' : route === 'mac' ? 'Detexify for Mac.' : route === 'impressum' ? 'Impressum.' : 'Draw. Find. Copy.'}</h1>
    <div class="subtitle">
      <p>{route === 'symbols' ? 'Inspect rendered symbols, packages, and commands.' : route === 'mac' ? 'A quiet menu-bar companion for LaTeX symbols, built around the same offline recognizer.' : route === 'impressum' ? 'Legal information for the Detexify Next website.' : 'Find the LaTeX command for a symbol you can draw but not name.'}</p>
      <nav class="hero-nav" aria-label="Sections">
        <a class:active={route === 'draw'} href="#/">Draw</a>
        <a class:active={route === 'symbols'} href="#/symbols">Symbols</a>
        {#if !isNativeShell}<a class:active={route === 'mac'} href="#/mac">Mac</a>{/if}
        {#if !isNativeShell}<a class:active={route === 'impressum'} href="#/impressum">Impressum</a>{/if}
        {#if canTrain}<a class:active={route === 'train'} href="#/train">Train</a>{/if}
        {#if canBenchmark}<a class:active={route === 'bench'} href="#/bench">Bench</a>{/if}
      </nav>
    </div>
  </section>

  {#if route === 'train' && canTrain}
    <TrainingView />
  {:else if route === 'symbols' && !isNativeShell}
    <SymbolGallery />
  {:else if route === 'mac' && !isNativeShell}
    <MacLanding />
  {:else if route === 'impressum' && !isNativeShell}
    <LegalNotice />
  {:else if route === 'bench' && canBenchmark}
    <BenchmarkView />
  {:else}
  <section class="workspace">
    <div class="panel draw-panel">
      <div class="panel-header">
        <div>
          <h2>Canvas</h2>
          <p>{statusMessage}{stats ? ` · ${stats}` : ''}</p>
        </div>
        <button class:visible={hasInk} type="button" onclick={clear} disabled={!hasInk}>Clear</button>
      </div>
      <div class="canvas-wrap">
        <DrawingCanvas {strokes} {onStrokeEnd} />
        {#if status === 'loading'}
          <div class="loading-overlay" role="status" aria-live="polite">
            <span></span>
            <p>Loading classifier data…</p>
          </div>
        {/if}
      </div>
      {#if !isNativeShell}
        <p class="hint">Draw with mouse, trackpad, Apple Pencil, or touch. Click a result to copy it.</p>
      {/if}
    </div>

    <div class="panel results-panel">
      <div class="panel-header">
        <div>
          <h2>Results</h2>
          <p>{copied ? `Copied ${copied}` : 'Best matches first'}</p>
        </div>
      </div>
      <ResultsList results={visibleResults} copiedCommand={copied} native={isNativeShell} onCopy={copyResult} />
      {#if canShowMore}
        <button class="show-more" type="button" onclick={() => resultLimit += 10}>Show more</button>
      {/if}
    </div>
  </section>
  {/if}
  {#if copied || copyError}
    <div class:error={!!copyError} class="copy-toast" role="status" aria-live="polite">
      <span class="copy-mark">{copyError ? '!' : '✓'}</span>
      <span class="copy-label">{copyError ? 'Copy failed' : 'Copied'}</span>
      <code>{copyError || copied}</code>
    </div>
  {/if}
</main>
