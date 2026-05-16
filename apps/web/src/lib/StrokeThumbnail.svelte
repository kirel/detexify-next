<script lang="ts">
  import { strokeDirectionMarkers, type Point, type Strokes } from '@detexify/core'
  import { onMount, tick } from 'svelte'

  type Props = {
    strokes: Strokes
    label?: string
  }

  let { strokes, label = 'Training sample' }: Props = $props()
  let canvas: HTMLCanvasElement
  let resizeObserver: ResizeObserver | undefined

  $effect(() => {
    strokes
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
    for (const stroke of strokes) drawStroke(context, stroke)
    context.restore()
  }

  function drawStroke(context: CanvasRenderingContext2D, stroke: Strokes[number]) {
    const first = stroke[0]
    if (!first) return

    context.strokeStyle = '#111827'
    context.lineWidth = 0.018
    context.beginPath()
    context.moveTo(first.x, first.y)
    if (stroke.length === 1) context.lineTo(first.x + 0.001, first.y + 0.001)
    else for (const point of stroke.slice(1)) context.lineTo(point.x, point.y)
    context.stroke()

    drawDirectionMarkers(context, stroke)
  }

  function drawDirectionMarkers(context: CanvasRenderingContext2D, stroke: Strokes[number]) {
    const first = stroke[0]
    const last = stroke[stroke.length - 1]
    if (!first || !last) return

    drawPointMarker(context, first, '#0f766e', 0.017)
    drawPointMarker(context, last, '#b45309', 0.014)

    for (const marker of strokeDirectionMarkers(stroke)) {
      drawArrowhead(context, marker.point, marker.angle)
    }
  }

  function drawPointMarker(context: CanvasRenderingContext2D, point: Point, fillStyle: string, radius: number) {
    context.save()
    context.fillStyle = '#fffdf8'
    context.beginPath()
    context.arc(point.x, point.y, radius * 1.45, 0, Math.PI * 2)
    context.fill()
    context.fillStyle = fillStyle
    context.beginPath()
    context.arc(point.x, point.y, radius, 0, Math.PI * 2)
    context.fill()
    context.restore()
  }

  function drawArrowhead(context: CanvasRenderingContext2D, point: Point, angle: number) {
    const length = 0.04
    const width = 0.026
    const back = {
      x: point.x - Math.cos(angle) * length,
      y: point.y - Math.sin(angle) * length,
    }
    const normal = {
      x: Math.cos(angle + Math.PI / 2) * width,
      y: Math.sin(angle + Math.PI / 2) * width,
    }

    context.save()
    context.lineJoin = 'round'
    drawArrowPath(context, point, back, normal)
    context.fillStyle = '#fffdf8'
    context.strokeStyle = '#fffdf8'
    context.lineWidth = 0.012
    context.stroke()
    context.fill()

    drawArrowPath(context, point, back, normal)
    context.fillStyle = '#0f766e'
    context.strokeStyle = '#0f766e'
    context.lineWidth = 0.004
    context.stroke()
    context.fill()
    context.restore()
  }

  function drawArrowPath(
    context: CanvasRenderingContext2D,
    point: Point,
    back: Point,
    normal: Point,
  ) {
    context.beginPath()
    context.moveTo(point.x, point.y)
    context.lineTo(back.x + normal.x, back.y + normal.y)
    context.lineTo(back.x - normal.x, back.y - normal.y)
    context.closePath()
  }
</script>

<canvas bind:this={canvas} class="stroke-thumbnail" aria-label={label}></canvas>
