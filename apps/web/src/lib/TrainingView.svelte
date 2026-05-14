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
  let selectedSampleId = $state('')
  let suspicious = $state<Record<string, string[]>>({})
  let loadSamplesRequest = 0

  const filteredSymbols = $derived.by(() => {
    const q = filter.trim().toLowerCase()
    const filtered = q
      ? symbols.filter((symbol) => [symbol.command, symbol.package, symbol.fontenc, symbol.id].some((value) => value?.toLowerCase().includes(q)))
      : symbols
    return [...filtered].sort((a, b) => a.command.localeCompare(b.command))
  })

  const selectedSymbol = $derived(symbols.find((symbol) => symbol.id === selectedId))
  const hasInk = $derived(strokes.length > 0)
  const visibleSamples = $derived(samples.filter((sample) => {
    if (sampleFilter === 'all') return true
    if (sampleFilter === 'rejected') return sample.rejected
    if (sampleFilter === 'suspicious') return !sample.rejected && sample.id in suspicious
    return !sample.rejected
  }))
  const selectedSample = $derived(samples.find((sample) => sample.id === selectedSampleId))
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
      } else if (event.key.toLowerCase() === 'r') {
        event.preventDefault()
        void reviewSelectedSample('reject')
      } else if (event.key.toLowerCase() === 'u') {
        event.preventDefault()
        void reviewSelectedSample('restore')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  async function loadSymbols() {
    try {
      const response = await fetch('/__detexify_lab__/symbols')
      if (!response.ok) throw new Error(`Could not load symbols: ${response.status}`)
      symbols = await response.json() as TrainingSymbol[]
      const rememberedId = window.localStorage.getItem('detexify.train.selectedSymbolId')
      selectedId = symbols.find((symbol) => symbol.id === rememberedId)?.id ?? symbols.find((symbol) => symbol.samples?.count)?.id ?? symbols[0]?.id ?? ''
      status = `${symbols.length} symbols ready for training`
    } catch (error) {
      status = error instanceof Error ? error.message : 'Could not load training data'
    }
  }

  async function loadSamples(symbolId: string) {
    const request = ++loadSamplesRequest
    samples = []
    suspicious = {}
    selectedSampleId = ''
    status = `Loading samples for ${symbolId}…`
    try {
      const response = await fetch(`/__detexify_lab__/samples?symbolId=${encodeURIComponent(symbolId)}`)
      if (!response.ok) throw new Error(`Could not load samples: ${response.status}`)
      const nextSamples = await response.json() as TrainingSample[]
      const nextSuspicious = await fetchSuspicious(symbolId)
      if (request !== loadSamplesRequest || symbolId !== selectedId) return
      samples = nextSamples
      suspicious = nextSuspicious
      selectedSampleId = nextSamples[0]?.id ?? ''
      status = `Loaded ${nextSamples.length} samples for ${selectedSymbol?.command ?? symbolId}`
    } catch (error) {
      if (request !== loadSamplesRequest) return
      samples = []
      status = error instanceof Error ? error.message : 'Could not load samples'
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

  async function reviewSelectedSample(action: 'reject' | 'restore') {
    if (!selectedSample) return
    await reviewSample(selectedSample, action)
  }

  function sampleState(sample: TrainingSample): 'rejected' | 'suspicious' | 'active' {
    if (sample.rejected) return 'rejected'
    if (sample.id in suspicious) return 'suspicious'
    return 'active'
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
      <p class="sample-counts"><span>{activeCount} active</span><span>{suspiciousCount} suspicious</span><span>{rejectedCount} rejected</span></p>
      <div class="sample-queues" role="group" aria-label="Sample queue">
        <button class:active={sampleFilter === 'all'} type="button" onclick={() => sampleFilter = 'all'}>All</button>
        <button class:active={sampleFilter === 'active'} type="button" onclick={() => sampleFilter = 'active'}>Active</button>
        <button class:active={sampleFilter === 'suspicious'} type="button" onclick={() => sampleFilter = 'suspicious'}>Suspicious</button>
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
          </button>
          {#if sample.rejected}
            <button class="sample-action restore" type="button" onclick={() => reviewSample(sample, 'restore')}>Restore <kbd>U</kbd></button>
          {:else}
            <button class="sample-action reject" type="button" onclick={() => reviewSample(sample, 'reject')}>Reject <kbd>R</kbd></button>
          {/if}
        </li>
      {/each}
    </ol>
  </aside>
</section>
