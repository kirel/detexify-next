<script lang="ts">
  type WebSymbol = {
    id: string
    legacyId: string
    command: string
    package?: string
    fontenc?: string
    mathmode: boolean
    textmode: boolean
    imagePath?: string
  }

  let symbols: WebSymbol[] = $state([])
  let filter = $state('')
  let sort = $state<'command' | 'package'>('command')
  let status = $state('Loading symbols…')

  const appBase = import.meta.env.BASE_URL
  fetch(new URL(`${appBase}data/symbols.json`, window.location.href).href)
    .then((response) => {
      if (!response.ok) throw new Error(`Failed to load symbols: ${response.status}`)
      return response.json() as Promise<WebSymbol[]>
    })
    .then((data) => {
      symbols = data
      status = `${data.length} symbols`
    })
    .catch((error) => {
      status = error instanceof Error ? error.message : String(error)
    })

  const visibleSymbols = $derived.by(() => {
    const q = filter.trim().toLowerCase()
    const filtered = q
      ? symbols.filter((symbol) => [symbol.command, symbol.package, symbol.fontenc, symbol.id].some((value) => value?.toLowerCase().includes(q)))
      : symbols

    return [...filtered].sort((a, b) => {
      if (sort === 'package') return compare(a.package ?? 'latex2e', b.package ?? 'latex2e') || compare(a.command, b.command)
      return compare(a.command, b.command)
    })
  })

  function compare(a: string, b: string): number {
    return a.localeCompare(b)
  }

  function mode(symbol: WebSymbol): string {
    if (symbol.mathmode && symbol.textmode) return 'math & text'
    if (symbol.mathmode) return 'math'
    return 'text'
  }
</script>

<section class="symbol-page">
  <div class="symbol-tools">
    <p>{status}{symbols.length ? ` · showing ${visibleSymbols.length}` : ''}</p>
    <label>
      <span>Filter</span>
      <input bind:value={filter} placeholder="\\infty, amssymb, arrow…" />
    </label>
    <label>
      <span>Sort</span>
      <select bind:value={sort}>
        <option value="command">command</option>
        <option value="package">package</option>
      </select>
    </label>
  </div>

  <ol class="symbol-grid">
    {#each visibleSymbols as symbol}
      <li class:missing={!symbol.imagePath}>
        <div class="symbol-card-preview" aria-hidden={!!symbol.imagePath}>
          {#if symbol.imagePath}
            <span class="symbol-image" style:background-image={`url(${symbol.imagePath})`}></span>
          {:else}
            <span>missing</span>
          {/if}
        </div>
        <div class="symbol-card-info">
          <code>{symbol.command}</code>
          <span>{symbol.package ?? 'latex2e'} · {mode(symbol)}</span>
          {#if symbol.fontenc}<span>{symbol.fontenc}</span>{/if}
        </div>
      </li>
    {/each}
  </ol>
</section>
