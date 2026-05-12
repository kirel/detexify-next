<script lang="ts">
  import type { EnrichedResult } from './types.js'

  type Props = {
    results: EnrichedResult[]
    copiedCommand?: string
    native?: boolean
    onCopy: (result: EnrichedResult) => void
  }

  let { results, copiedCommand = '', native = false, onCopy }: Props = $props()

  function packageLine(result: EnrichedResult): string | undefined {
    if (!result.symbol?.package) return undefined
    return `\\usepackage{${result.symbol.package}}`
  }

  function fontencLine(result: EnrichedResult): string | undefined {
    if (!result.symbol?.fontenc) return undefined
    return `\\usepackage[${result.symbol.fontenc}]{fontenc}`
  }

  function mode(result: EnrichedResult): string {
    if (result.symbol?.mathmode && result.symbol.textmode) return 'math & text'
    if (result.symbol?.mathmode) return 'math'
    return 'text'
  }
</script>

{#if results.length === 0}
  <p class="empty">{native ? 'Draw a symbol' : 'Draw a symbol to see matches.'}</p>
{:else}
  <ol class="results">
    {#each results as result}
      <li>
        <button
          class="result"
          class:copied={copiedCommand === (result.symbol?.command ?? result.id)}
          type="button"
          onclick={() => onCopy(result)}
          title="Copy command"
        >
          <span class="symbol-preview" aria-hidden="true">
            {#if result.symbol?.imagePath}
              <span class="symbol-image" style:background-image={`url(${result.symbol.imagePath})`}></span>
            {:else}
              <span>?</span>
            {/if}
          </span>
          <span class="result-info">
            <span class="result-topline">
              <span class="command">{result.symbol?.command ?? result.id}</span>
              <span class="score">{copiedCommand === (result.symbol?.command ?? result.id) ? 'copied' : result.score.toFixed(4)}</span>
            </span>
            <span class="mode">{mode(result)}</span>
            {#if packageLine(result)}<code>{packageLine(result)}</code>{/if}
            {#if fontencLine(result)}<code>{fontencLine(result)}</code>{/if}
          </span>
        </button>
      </li>
    {/each}
  </ol>
{/if}
