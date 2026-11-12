<script lang="ts">
  import type { EnrichedResult } from './types.js'

  type Props = {
    results: EnrichedResult[]
    copiedId?: string
    native?: boolean
    onCopy: (result: EnrichedResult, unicode: boolean) => void
  }

  let { results, copiedId = '', native = false, onCopy }: Props = $props()

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
      {@const copied = (copiedId == result.id)}
      <li>
        <div class="result" class:copied>
          <button class="symbol-preview-button" type="button" onclick={() => onCopy(result, false)} title="Copy command">
            <span class="symbol-preview" aria-hidden="true">
              {#if result.symbol?.imagePath}
                <span class="symbol-image" style:background-image={`url(${result.symbol.imagePath})`}></span>
              {:else}
                <span>?</span>
              {/if}
            </span>
          </button>
          <span class="result-info">
            <span class="result-topline">
              <span class="command">{result.symbol?.command ?? result.id}</span>
              <span class="result-meta">
                <span class="score">{copied ? 'copied' : result.score.toFixed(4)}</span>
                <div class="copy-actions">
                  <button class="copy-command" type="button" onclick={() => onCopy(result, false)} title="Copy command">Copy</button>
                  {#if result.symbol?.unicode ?? false}
                    <button class="copy-command copy-text" type="button" onclick={() => onCopy(result, true)} title="Copy text">Copy text</button>
                  {/if}
                </div>
              </span>
            </span>
            <span class="mode">{mode(result)}</span>
            {#if packageLine(result)}<code>{packageLine(result)}</code>{/if}
            {#if fontencLine(result)}<code>{fontencLine(result)}</code>{/if}
          </span>
        </div>
      </li>
    {/each}
  </ol>
{/if}
