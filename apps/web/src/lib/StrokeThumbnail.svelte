<script lang="ts">
  import type { Strokes } from '@detexify/core'
  import { onMount, tick } from 'svelte'

  type Props = {
    strokes: Strokes
    label?: string
    mode?: 'composite' | 'sequence'
  }

  let { strokes, label = 'Training sample', mode = 'composite' }: Props = $props()
  let canvas: HTMLCanvasElement
  let resizeObserver: ResizeObserver | undefined

  $effect(() => {
    strokes
    mode
    void drawSoon()
  })

  onMount(() => {
    resizeObserver = new ResizeObserver(() => draw())
    if (canvas) resizeObserver.observe(canvas)
    void drawSoon()
    return () => resizeObserver?.disconnect()
  })

  async function drawSoon() {
    await tick()
    draw()
  }

  function draw() {
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    const width = Math.max(1, Math.floor(rect.width * dpr))
    const height = Math.max(1, Math.floor(rect.height * dpr))
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }

    context.clearRect(0, 0, width, height)
    context.save()
    context.scale(width, height)
    context.lineCap = 'round'
    context.lineJoin = 'round'

    if (mode === 'sequence' && strokes.length > 1) drawStrokeSequence(context, strokes)
    else drawComposite(context, strokes)

    context.restore()
  }

  function drawComposite(context: CanvasRenderingContext2D, nextStrokes: Strokes) {
    context.strokeStyle = '#111827'
    context.lineWidth = 0.018
    for (const stroke of nextStrokes) drawStroke(context, stroke, { x: 0, y: 0, width: 1, height: 1 })
  }

  function drawStrokeSequence(context: CanvasRenderingContext2D, nextStrokes: Strokes) {
    const { columns, rows } = gridFor(nextStrokes.length)
    const gap = 0.018
    const cellWidth = (1 - gap * (columns + 1)) / columns
    const cellHeight = (1 - gap * (rows + 1)) / rows

    context.strokeStyle = 'rgba(17, 24, 39, 0.12)'
    context.lineWidth = 0.006
    for (const [index] of nextStrokes.entries()) {
      const column = index % columns
      const row = Math.floor(index / columns)
      const x = gap + column * (cellWidth + gap)
      const y = gap + row * (cellHeight + gap)
      context.strokeRect(x, y, cellWidth, cellHeight)
    }

    context.strokeStyle = '#111827'
    context.lineWidth = Math.min(cellWidth, cellHeight) * 0.055
    for (const [index, stroke] of nextStrokes.entries()) {
      const column = index % columns
      const row = Math.floor(index / columns)
      const inset = Math.min(cellWidth, cellHeight) * 0.12
      drawStroke(context, stroke, {
        x: gap + column * (cellWidth + gap) + inset,
        y: gap + row * (cellHeight + gap) + inset,
        width: cellWidth - inset * 2,
        height: cellHeight - inset * 2,
      })
    }
  }

  function gridFor(count: number): { columns: number; rows: number } {
    if (count <= 1) return { columns: 1, rows: 1 }
    if (count <= 3) return { columns: count, rows: 1 }
    const columns = Math.ceil(Math.sqrt(count))
    return { columns, rows: Math.ceil(count / columns) }
  }

  function drawStroke(context: CanvasRenderingContext2D, stroke: readonly { x: number; y: number }[], bounds: { x: number; y: number; width: number; height: number }) {
    const first = stroke[0]
    if (!first) return
    context.beginPath()
    context.moveTo(bounds.x + first.x * bounds.width, bounds.y + first.y * bounds.height)
    if (stroke.length === 1) context.lineTo(bounds.x + (first.x + 0.001) * bounds.width, bounds.y + (first.y + 0.001) * bounds.height)
    else for (const point of stroke.slice(1)) context.lineTo(bounds.x + point.x * bounds.width, bounds.y + point.y * bounds.height)
    context.stroke()
  }
</script>

<canvas bind:this={canvas} class="stroke-thumbnail" aria-label={label}></canvas>
