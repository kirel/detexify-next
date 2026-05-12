<script lang="ts">
  import type { Strokes } from '@detexify/core'

  type Props = {
    strokes: Strokes
    label?: string
  }

  let { strokes, label = 'Training sample' }: Props = $props()
  let canvas: HTMLCanvasElement

  $effect(() => {
    strokes
    draw()
  })

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
    context.strokeStyle = '#111827'
    context.lineWidth = 0.018
    for (const stroke of strokes) drawStroke(context, stroke)
    context.restore()
  }

  function drawStroke(context: CanvasRenderingContext2D, stroke: readonly { x: number; y: number }[]) {
    const first = stroke[0]
    if (!first) return
    context.beginPath()
    context.moveTo(first.x, first.y)
    if (stroke.length === 1) context.lineTo(first.x + 0.001, first.y + 0.001)
    else for (const point of stroke.slice(1)) context.lineTo(point.x, point.y)
    context.stroke()
  }
</script>

<canvas bind:this={canvas} class="stroke-thumbnail" aria-label={label}></canvas>
