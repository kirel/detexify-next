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
  let rejectReason = $state('scribble')

  const filteredSymbols = $derived.by(() => {
    const q = filter.trim().toLowerCase()
    const filtered = q
      ? symbols.filter((symbol) => [symbol.command, symbol.package, symbol.fontenc, symbol.id].some((value) => value?.toLowerCase().includes(q)))
      : symbols
    return [...filtered].sort((a, b) => a.command.localeCompare(b.command))
  })

  const selectedSymbol = $derived(symbols.find((symbol) => symbol.id === selectedId))
  const hasInk = $derived(strokes.length > 0)

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
      selectedId = symbols.find((symbol) => symbol.samples?.count)?.id ?? symbols[0]?.id ?? ''
      status = `${symbols.length} symbols ready for training`
    } catch (error) {
      status = error instanceof Error ? error.message : 'Could not load training data'
    }
  }

  async function loadSamples(symbolId: string) {
    try {
      const response = await fetch(`/__detexify_lab__/samples?symbolId=${encodeURIComponent(symbolId)}`)
      if (!response.ok) throw new Error(`Could not load samples: ${response.status}`)
      samples = await response.json() as TrainingSample[]
    } catch (error) {
      samples = []
      status = error instanceof Error ? error.message : 'Could not load samples'
    }
  }

  function selectSymbol(symbol: TrainingSymbol) {
    selectedId = symbol.id
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
    } catch (error) {
      status = error instanceof Error ? error.message : 'Could not update sample review'
    }
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
              <small>{symbol.package ?? 'latex2e'} · {symbol.samples?.count ?? 0}</small>
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
      <label>
        <span>Reject reason</span>
        <select bind:value={rejectReason}>
          <option value="scribble">scribble</option>
          <option value="wrong-symbol">wrong symbol</option>
          <option value="empty">empty</option>
          <option value="duplicate">duplicate</option>
          <option value="bad-normalization">bad normalization</option>
          <option value="other">other</option>
        </select>
      </label>
    </div>
    <ol>
      {#each samples as sample}
        <li class:rejected={sample.rejected}>
          <StrokeThumbnail strokes={sample.strokes} label={sample.id} />
          <small>{sample.rejected ? `rejected: ${sample.rejection?.reason ?? 'other'}` : sample.source?.kind ?? 'sample'}</small>
          {#if sample.rejected}
            <button type="button" onclick={() => reviewSample(sample, 'restore')}>Restore</button>
          {:else}
            <button type="button" onclick={() => reviewSample(sample, 'reject')}>Reject</button>
          {/if}
        </li>
      {/each}
    </ol>
  </aside>
</section>
