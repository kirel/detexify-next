<script lang="ts">
  import type { StrokeSample } from '@detexify/core'

  type Row = {
    engine: string
    symbols: number
    holdouts: number
    top1: number
    top5: number
    top10: number
    meanMs: number
    p95Ms: number
  }

  let running = $state(false)
  let status = $state('Ready')
  let rows: Row[] = $state([])
  let maxSymbols = $state(200)

  async function runBenchmark() {
    running = true
    status = 'Loading classifier data…'
    try {
      const [{ LegacyDtwClassifier }, { snapshotFromLegacyJson }] = await Promise.all([
        import('@detexify/core'),
        import('@detexify/core/legacy'),
      ])
      const snapshotJson = await fetch(`${import.meta.env.BASE_URL}data/snapshot.json`).then((response) => response.json())
      const snapshot = snapshotFromLegacyJson(snapshotJson)
      const selected = [...snapshot.keys()].sort().slice(0, maxSymbols)
      const { train, holdouts } = splitHoldouts(snapshot, selected)
      status = `Benchmarking ${selected.length} symbols / ${holdouts.length} holdouts…`
      const classifier = new LegacyDtwClassifier(train)
      const latencies: number[] = []
      let top1 = 0
      let top5 = 0
      let top10 = 0
      for (const holdout of holdouts) {
        const before = performance.now()
        const results = classifier.classifySync(holdout.sample.strokes, { limit: 10 })
        latencies.push(performance.now() - before)
        const ids = results.map((result) => result.id)
        if (ids[0] === holdout.id) top1 += 1
        if (ids.slice(0, 5).includes(holdout.id)) top5 += 1
        if (ids.slice(0, 10).includes(holdout.id)) top10 += 1
        if (latencies.length % 25 === 0) status = `Benchmarked ${latencies.length}/${holdouts.length} holdouts…`
      }
      latencies.sort((a, b) => a - b)
      rows = [{
        engine: 'legacy-dtw',
        symbols: selected.length,
        holdouts: holdouts.length,
        top1: top1 / holdouts.length,
        top5: top5 / holdouts.length,
        top10: top10 / holdouts.length,
        meanMs: mean(latencies),
        p95Ms: percentile(latencies, 0.95),
      }, ...rows]
      status = 'Done'
    } catch (error) {
      status = error instanceof Error ? error.message : 'Benchmark failed'
    } finally {
      running = false
    }
  }

  function splitHoldouts(snapshot: ReadonlyMap<string, readonly StrokeSample[]>, selectedIds: readonly string[]) {
    const selected = new Set(selectedIds)
    const trainEntries: [string, readonly StrokeSample[]][] = []
    const holdouts: { id: string; sample: StrokeSample }[] = []
    for (const [id, samples] of snapshot.entries()) {
      if (!selected.has(id) || samples.length <= 1) continue
      holdouts.push({ id, sample: samples[0]! })
      trainEntries.push([id, samples.slice(1)])
    }
    return { train: new Map(trainEntries), holdouts }
  }

  function mean(values: readonly number[]) {
    return values.reduce((sum, value) => sum + value, 0) / values.length
  }

  function percentile(values: readonly number[], p: number) {
    return values[Math.min(values.length - 1, Math.max(0, Math.floor((values.length - 1) * p)))] ?? 0
  }
</script>

<section class="benchmark-page">
  <div class="benchmark-card">
    <h2>Browser benchmark</h2>
    <p>Run this in Chrome, Safari, or the Mac WebView to measure the current browser runtime. Results are local and not submitted anywhere.</p>
    <label>
      <span>Max symbols</span>
      <input type="number" min="10" max="1073" bind:value={maxSymbols} />
    </label>
    <button type="button" onclick={runBenchmark} disabled={running}>{running ? 'Running…' : 'Run benchmark'}</button>
    <p>{status}</p>
  </div>

  {#if rows.length > 0}
    <table class="benchmark-table">
      <thead><tr><th>Engine</th><th>Symbols</th><th>Holdouts</th><th>Top1</th><th>Top5</th><th>Top10</th><th>Mean</th><th>p95</th></tr></thead>
      <tbody>
        {#each rows as row}
          <tr><td>{row.engine}</td><td>{row.symbols}</td><td>{row.holdouts}</td><td>{row.top1.toFixed(3)}</td><td>{row.top5.toFixed(3)}</td><td>{row.top10.toFixed(3)}</td><td>{row.meanMs.toFixed(2)}ms</td><td>{row.p95Ms.toFixed(2)}ms</td></tr>
        {/each}
      </tbody>
    </table>
  {/if}
</section>
