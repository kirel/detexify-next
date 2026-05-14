<script lang="ts">
  import type { Strokes } from '@detexify/core'
  import { onMount } from 'svelte'
  import DrawingCanvas from './DrawingCanvas.svelte'
  import StrokeThumbnail from './StrokeThumbnail.svelte'

  type TrainingSymbol = {
    id: string
    command: string
    package?: string
    fontenc?: string
    mode: 'math' | 'text' | 'both'
    imagePath?: string
    samples?: { path: string; count: number }
  }

  type TrainingSample = {
    id: string
    symbolId: string
    source?: { kind?: string; createdAt?: string; legacyId?: string; index?: number }
    strokes: Strokes
    rejected: boolean
    rejection?: { reason: string; rejectedAt: string; rejectedBy?: string } | undefined
  }

  let symbols: TrainingSymbol[] = $state([])
  let selectedId = $state('')
  let samples: TrainingSample[] = $state([])
  let strokes: Strokes = $state([])
  let filter = $state('')
  let status = $state('Loading training data…')
  let saving = $state(false)
  let rejectReason = $state('bad-sample')
  let sampleFilter = $state<'all' | 'active' | 'rejected' | 'suspicious'>('all')
  let symbolSort = $state<'command' | 'suspicious'>('command')
  let selectedSampleId = $state('')
  let suspicious = $state<Record<string, string[]>>({})
  let suspiciousSummary = $state<Record<string, { suspiciousCount: number; highConfidenceCount: number; mediumConfidenceCount: number }>>({})
  let suspiciousLoading = $state(false)
  let summaryState = $state<'idle' | 'queued' | 'loading' | 'ready' | 'failed'>('idle')
  let loadSamplesRequest = 0
  let summaryTimer: number | undefined

  const filteredSymbols = $derived.by(() => {
    const q = filter.trim().toLowerCase()
    const filtered = q
      ? symbols.filter((symbol) => [symbol.command, symbol.package, symbol.fontenc, symbol.id].some((value) => value?.toLowerCase().includes(q)))
      : symbols
    return [...filtered].sort((a, b) => {
      if (symbolSort === 'suspicious') {
        return (suspiciousSummary[b.id]?.suspiciousCount ?? 0) - (suspiciousSummary[a.id]?.suspiciousCount ?? 0)
          || (suspiciousSummary[b.id]?.highConfidenceCount ?? 0) - (suspiciousSummary[a.id]?.highConfidenceCount ?? 0)
          || a.command.localeCompare(b.command)
      }
      return a.command.localeCompare(b.command)
    })
  })

  const selectedSymbol = $derived(symbols.find((symbol) => symbol.id === selectedId))
  const hasInk = $derived(strokes.length > 0)
  const visibleSamples = $derived(samples.filter((sample) => {
    if (sampleFilter === 'all') return true
    if (sampleFilter === 'rejected') return sample.rejected
    if (sampleFilter === 'suspicious') return !sample.rejected && sample.id in suspicious
    return !sample.rejected
  }))
  const activeCount = $derived(samples.filter((sample) => !sample.rejected).length)
  const rejectedCount = $derived(samples.filter((sample) => sample.rejected).length)
  const suspiciousCount = $derived(samples.filter((sample) => !sample.rejected && sample.id in suspicious).length)

  loadSymbols()

  $effect(() => {
    if (selectedId) loadSamples(selectedId)
  })

  onMount(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target instanceof HTMLElement && target.isContentEditable) return
      if (event.key === 'Enter') {
        event.preventDefault()
        void saveSample()
      } else if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault()
        clear()
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        undo()
      } else if (event.key.toLowerCase() === 'n') {
        event.preventDefault()
        selectNextSample()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.clearTimeout(summaryTimer)
    }
  })

  async function loadSymbols() {
    try {
      const response = await fetch('/__detexify_lab__/symbols')
      if (!response.ok) throw new Error(`Could not load symbols: ${response.status}`)
      symbols = await response.json() as TrainingSymbol[]
      const rememberedId = window.localStorage.getItem('detexify.train.selectedSymbolId')
      selectedId = symbols.find((symbol) => symbol.id === rememberedId)?.id ?? symbols.find((symbol) => symbol.samples?.count)?.id ?? symbols[0]?.id ?? ''
      status = `${symbols.length} symbols ready for training`
      scheduleSuspiciousSummary()
    } catch (error) {
      status = error instanceof Error ? error.message : 'Could not load training data'
    }
  }

  async function loadSamples(symbolId: string) {
    const request = ++loadSamplesRequest
    samples = []
    suspicious = {}
    suspiciousLoading = false
    selectedSampleId = ''
    status = `Loading samples for ${symbolId}…`
    try {
      const response = await fetch(`/__detexify_lab__/samples?symbolId=${encodeURIComponent(symbolId)}`)
      if (!response.ok) throw new Error(`Could not load samples: ${response.status}`)
      const nextSamples = await response.json() as TrainingSample[]
      if (request !== loadSamplesRequest || symbolId !== selectedId) return
      samples = nextSamples
      selectedSampleId = nextSamples[0]?.id ?? ''
      status = `Loaded ${nextSamples.length} samples for ${selectedSymbol?.command ?? symbolId}`
      void loadSuspiciousForSymbol(symbolId, request)
    } catch (error) {
      if (request !== loadSamplesRequest) return
      samples = []
      status = error instanceof Error ? error.message : 'Could not load samples'
    }
  }

  async function loadSuspiciousForSymbol(symbolId: string, request: number) {
    suspiciousLoading = true
    try {
      const nextSuspicious = await fetchSuspicious(symbolId)
      if (request !== loadSamplesRequest || symbolId !== selectedId) return
      suspicious = nextSuspicious
    } finally {
      if (request === loadSamplesRequest && symbolId === selectedId) suspiciousLoading = false
    }
  }

  function scheduleSuspiciousSummary() {
    if (summaryState !== 'idle') return
    summaryState = 'queued'
    window.clearTimeout(summaryTimer)
    summaryTimer = window.setTimeout(() => void loadSuspiciousSummary(), 700)
  }

  async function loadSuspiciousSummary() {
    if (summaryState === 'loading' || summaryState === 'ready') return
    summaryState = 'loading'
    try {
      const response = await fetch('/__detexify_lab__/suspicious-summary')
      if (!response.ok) throw new Error(await response.text())
      const rows = await response.json() as { symbolId: string; suspiciousCount: number; highConfidenceCount: number; mediumConfidenceCount: number }[]
      suspiciousSummary = Object.fromEntries(rows.map((row) => [row.symbolId, {
        suspiciousCount: row.suspiciousCount,
        highConfidenceCount: row.highConfidenceCount,
        mediumConfidenceCount: row.mediumConfidenceCount,
      }]))
      summaryState = 'ready'
    } catch {
      suspiciousSummary = {}
      summaryState = 'failed'
    }
  }

  async function fetchSuspicious(symbolId: string): Promise<Record<string, string[]>> {
    try {
      const response = await fetch(`/__detexify_lab__/suspicious-samples?symbolId=${encodeURIComponent(symbolId)}`)
      if (!response.ok) throw new Error(await response.text())
      const rows = await response.json() as { sampleId: string; reasons: string[] }[]
      return Object.fromEntries(rows.map((row) => [row.sampleId, row.reasons]))
    } catch {
      return {}
    }
  }

  function selectSymbol(symbol: TrainingSymbol) {
    selectedId = symbol.id
    window.localStorage.setItem('detexify.train.selectedSymbolId', symbol.id)
    selectedSampleId = ''
    samples = []
    suspicious = {}
    strokes = []
  }

  function onStrokeEnd(nextStrokes: Strokes) {
    strokes = nextStrokes
  }

  function clear() {
    strokes = []
  }

  function undo() {
    strokes = strokes.slice(0, -1)
  }

  async function reviewSample(sample: TrainingSample, action: 'reject' | 'restore') {
    try {
      const response = await fetch('/__detexify_lab__/sample-review', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sampleId: sample.id, action, reason: rejectReason }),
      })
      if (!response.ok) throw new Error(await response.text())
      const result = await response.json() as Pick<TrainingSample, 'rejected' | 'rejection'> & { sampleId: string }
      samples = samples.map((candidate) => candidate.id === result.sampleId
        ? { ...candidate, rejected: result.rejected, rejection: result.rejection }
        : candidate)
      status = action === 'reject' ? `Rejected ${sample.id}` : `Restored ${sample.id}`
      selectNextSample()
    } catch (error) {
      status = error instanceof Error ? error.message : 'Could not update sample review'
    }
  }

  function sampleState(sample: TrainingSample): 'rejected' | 'suspicious' | 'active' {
    if (sample.rejected) return 'rejected'
    if (sample.id in suspicious) return 'suspicious'
    return 'active'
  }

  function sampleReasons(sample: TrainingSample): string {
    const reasons = sample.rejected
      ? [sample.rejection?.reason ?? 'other']
      : suspicious[sample.id] ?? []
    if (reasons.length === 0) return ''
    const labels = reasons.map(reasonLabel)
    const shown = labels.slice(0, 2).join(' · ')
    return labels.length > 2 ? `${shown} +${labels.length - 2}` : shown
  }

  function reasonLabel(reason: string): string {
    const labels: Record<string, string> = {
      'bad-sample': 'bad sample',
      'wrong-symbol': 'wrong symbol',
      'bad-normalization': 'normalization',
      'few-points': 'few points',
      'few-points-relative-to-symbol': 'few points',
      'very-many-points': 'many points',
      'degenerate-bounds': 'flat bounds',
      'tiny-bounds': 'tiny',
      'tiny-relative-to-symbol': 'tiny',
      'mostly-single-point-strokes': 'point strokes',
      'near-duplicate': 'duplicate',
      'intra-symbol-outlier': 'outlier',
    }
    return labels[reason] ?? reason.replaceAll('-', ' ')
  }

  function shortSampleId(sample: TrainingSample): string {
    return sample.id.split(':').at(-1) ?? sample.id
  }

  function selectNextSample() {
    const current = visibleSamples.findIndex((sample) => sample.id === selectedSampleId)
    const next = visibleSamples[current + 1] ?? visibleSamples[0]
    selectedSampleId = next?.id ?? ''
  }

  async function saveSample() {
    if (!selectedSymbol || strokes.length === 0 || saving) return
    saving = true
    try {
      const response = await fetch('/__detexify_lab__/samples', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ symbolId: selectedSymbol.id, strokes: cloneStrokes(strokes) }),
      })
      if (!response.ok) throw new Error(await response.text())
      const sample = await response.json() as TrainingSample
      samples = [...samples, sample]
      symbols = symbols.map((symbol) => symbol.id === selectedSymbol.id
        ? { ...symbol, samples: { path: symbol.samples?.path ?? '', count: (symbol.samples?.count ?? 0) + 1 } }
        : symbol)
      strokes = []
      status = `Saved sample for ${selectedSymbol.command}`
    } catch (error) {
      status = error instanceof Error ? error.message : 'Could not save sample'
    } finally {
      saving = false
    }
  }

  function cloneStrokes(value: Strokes): Strokes {
    return value.map((stroke) => stroke.map((point) => ({ x: point.x, y: point.y })))
  }

  function symbolSuspiciousCount(symbol: TrainingSymbol): number {
    return suspiciousSummary[symbol.id]?.suspiciousCount ?? 0
  }

  function coverageHint(symbol: TrainingSymbol): string {
    const count = symbol.samples?.count ?? 0
    if (count === 0) return 'no samples yet'
    if (count < 5) return 'needs samples'
    if (count < 20) return 'could use more'
    return 'healthy coverage'
  }

  function mode(symbol: TrainingSymbol): string {
    if (symbol.mode === 'both') return 'math & text'
    return symbol.mode
  }
</script>

<section class="training-page">
  <aside class="training-symbols">
    <div class="training-search">
      <label>
        <span>Train symbol</span>
        <input bind:value={filter} placeholder="\\infty, amssymb, arrow…" />
      </label>
      <p>{status}</p>
      <label>
        <span>Sort symbols</span>
        <select bind:value={symbolSort}>
          <option value="command">Command</option>
          <option value="suspicious" disabled={summaryState !== 'ready'}>Suspicious first</option>
        </select>
      </label>
      <div class:loading={summaryState === 'loading' || summaryState === 'queued'} class="lab-load-line">
        {#if summaryState === 'ready'}
          <span>{Object.keys(suspiciousSummary).length} symbols with suspicious samples</span>
        {:else if summaryState === 'failed'}
          <span>Suspicious scan failed</span>
          <button type="button" onclick={() => void loadSuspiciousSummary()}>Retry</button>
        {:else}
          <span class="mini-spinner" aria-hidden="true"></span>
          <span>{summaryState === 'queued' ? 'Suspicious scan queued…' : 'Scanning suspicious samples in background…'}</span>
        {/if}
      </div>
    </div>

    <ol>
      {#each filteredSymbols as symbol}
        <li>
          <button class:active={symbol.id === selectedId} type="button" onclick={() => selectSymbol(symbol)}>
            <span class="train-symbol-image">
              {#if symbol.imagePath}<span class="symbol-image" style:background-image={`url(${symbol.imagePath})`}></span>{/if}
            </span>
            <span>
              <code>{symbol.command}</code>
              <small>{symbol.package ?? 'latex2e'} · {symbol.samples?.count ?? 0} · {coverageHint(symbol)}</small>
              {#if symbolSuspiciousCount(symbol) > 0}<small class="symbol-suspicious-count">{symbolSuspiciousCount(symbol)} suspicious</small>{/if}
            </span>
          </button>
        </li>
      {/each}
    </ol>
  </aside>

  <section class="training-workbench">
    {#if selectedSymbol}
      <div class="training-target">
        <div class="training-target-image">
          {#if selectedSymbol.imagePath}<span class="symbol-image" style:background-image={`url(${selectedSymbol.imagePath})`}></span>{/if}
        </div>
        <div>
          <h2>{selectedSymbol.command}</h2>
          <p>{selectedSymbol.package ?? 'latex2e'} · {mode(selectedSymbol)}{selectedSymbol.fontenc ? ` · ${selectedSymbol.fontenc}` : ''}</p>
          <p>{samples.length} samples loaded · {samples.filter((sample) => sample.rejected).length} rejected</p>
        </div>
      </div>

      <DrawingCanvas {strokes} {onStrokeEnd} />
      <div class="training-actions">
        <button type="button" onclick={saveSample} disabled={!hasInk || saving}>{saving ? 'Saving…' : 'Save sample'} <kbd>Enter</kbd></button>
        <button type="button" onclick={undo} disabled={!hasInk}>Undo <kbd>⌘Z</kbd></button>
        <button type="button" onclick={clear} disabled={!hasInk}>Clear <kbd>⌫</kbd></button>
      </div>
    {:else}
      <p class="empty">No training symbol selected.</p>
    {/if}
  </section>

  <aside class="training-samples">
    <div class="training-samples-header">
      <h2>Existing samples</h2>
      <p class="sample-counts"><span>{activeCount} active</span><span>{suspiciousLoading ? 'scanning…' : `${suspiciousCount} suspicious`}</span><span>{rejectedCount} rejected</span></p>
      {#if suspiciousLoading}<p class="sample-scan-note"><span class="mini-spinner" aria-hidden="true"></span> sample review hints are loading in the background</p>{/if}
      <div class="sample-queues" role="group" aria-label="Sample queue">
        <button class:active={sampleFilter === 'all'} type="button" onclick={() => sampleFilter = 'all'}>All</button>
        <button class:active={sampleFilter === 'active'} type="button" onclick={() => sampleFilter = 'active'}>Active</button>
        <button class:active={sampleFilter === 'suspicious'} type="button" disabled={suspiciousLoading} onclick={() => sampleFilter = 'suspicious'}>Suspicious</button>
        <button class:active={sampleFilter === 'rejected'} type="button" onclick={() => sampleFilter = 'rejected'}>Rejected</button>
      </div>
      <label>
        <span>Reject as</span>
        <select bind:value={rejectReason}>
          <option value="bad-sample">bad sample</option>
          <option value="wrong-symbol">wrong symbol</option>
          <option value="duplicate">duplicate</option>
          <option value="empty">empty</option>
          <option value="bad-normalization">bad normalization</option>
          <option value="other">other</option>
        </select>
      </label>
    </div>
    <ol>
      {#each visibleSamples as sample (sample.id)}
        <li class:rejected={sample.rejected} class:suspicious={!sample.rejected && sample.id in suspicious} class:selected={sample.id === selectedSampleId}>
          <button class="sample-card" type="button" onclick={() => selectedSampleId = sample.id} aria-label={`Select ${sample.id}`}>
            <span class="sample-card-topline">
              <span class:active={sampleState(sample) === 'active'} class:rejected={sampleState(sample) === 'rejected'} class:suspicious={sampleState(sample) === 'suspicious'} class="sample-state">{sampleState(sample)}</span>
              <span class="sample-id">{shortSampleId(sample)}</span>
            </span>
            <StrokeThumbnail strokes={sample.strokes} label={sample.id} />
            {#if sampleReasons(sample)}<span class="sample-note">{sampleReasons(sample)}</span>{/if}
          </button>
          {#if sample.rejected}
            <button class="sample-action restore" type="button" onclick={() => reviewSample(sample, 'restore')}>Restore</button>
          {:else}
            <button class="sample-action reject" type="button" onclick={() => reviewSample(sample, 'reject')}>Reject</button>
          {/if}
        </li>
      {/each}
    </ol>
  </aside>
</section>
