<script lang="ts">
  import type { Strokes } from '@detexify/core'

  type Props = {
    strokes: Strokes
    onStrokeEnd: (strokes: Strokes) => void
  }

  let { strokes, onStrokeEnd }: Props = $props()
  let canvas: HTMLCanvasElement
  let drawing = false
  let currentStroke: { x: number; y: number }[] = []

  $effect(() => {
    strokes
    draw()
  })

  function pointerDown(event: PointerEvent) {
    event.preventDefault()
    try {
      canvas.setPointerCapture(event.pointerId)
    } catch {
      // Synthetic pointer events in automated tests do not always have an active pointer.
    }
    drawing = true
    currentStroke = [normalizedPoint(event)]
    draw()
  }

  function pointerMove(event: PointerEvent) {
    if (!drawing) return
    event.preventDefault()
    const next = normalizedPoint(event)
    const previous = currentStroke.at(-1)
    if (!previous || Math.hypot(next.x - previous.x, next.y - previous.y) > 0.001) {
      currentStroke = [...currentStroke, next]
      draw()
    }
  }

  function pointerUp(event: PointerEvent) {
    if (!drawing) return
    event.preventDefault()
    drawing = false
    const nextStrokes = [...strokes, currentStroke]
    currentStroke = []
    onStrokeEnd(nextStrokes)
    drawWith(nextStrokes, [])
  }

  function normalizedPoint(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect()
    return {
      x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
      y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
    }
  }

  function draw() {
    drawWith(strokes, currentStroke)
  }

  function drawWith(committed: Strokes, active: readonly { x: number; y: number }[]) {
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
    context.lineWidth = 0.012

    for (const stroke of committed) drawStroke(context, stroke)
    if (active.length > 0) {
      context.strokeStyle = '#2563eb'
      drawStroke(context, active)
    }

    context.restore()
  }

  function drawStroke(context: CanvasRenderingContext2D, stroke: readonly { x: number; y: number }[]) {
    const first = stroke[0]
    if (!first) return
    context.beginPath()
    context.moveTo(first.x, first.y)
    if (stroke.length === 1) {
      context.lineTo(first.x + 0.001, first.y + 0.001)
    } else {
      for (const point of stroke.slice(1)) context.lineTo(point.x, point.y)
    }
    context.stroke()
  }

  function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value))
  }
</script>

<canvas
  bind:this={canvas}
  class="drawing-canvas"
  aria-label="Draw a LaTeX symbol"
  onpointerdown={pointerDown}
  onpointermove={pointerMove}
  onpointerup={pointerUp}
  onpointercancel={pointerUp}
></canvas>
