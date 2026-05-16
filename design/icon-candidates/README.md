# Detexify Next icon candidates

Generated via Codex built-in `image_gen.imagegen` as exploratory raster candidates for favicon/app-icon direction. All PNGs are normalized to 1024×1024.

Detexify's core job is not “show math symbols”, but: a user has an unknown handwritten glyph, draws it, and gets the LaTeX command. The stronger candidates should therefore suggest handwriting recognition / draw → command, while still staying readable as a tiny favicon.

## Candidates

Initial math-symbol-oriented pass:

1. `01-ink-integral.png` — hand-drawn contour/integral stroke on warm paper.
2. `02-magnifier-symbol.png` — magnifying glass finding a sketched math symbol.
3. `03-canvas-corner.png` — drawing canvas grid with lower-left corner glyph.
4. `04-sigma-spark.png` — bold sigma/sum-like symbol with discovery sparkle.
5. `05-stroke-alpha.png` — fluid handwritten alpha-like stroke.

Second, product-job-oriented pass:

6. `06-recognition-spark.png` — unknown handwritten glyph with recognition check/spark.
7. `07-glyph-to-command.png` — ink squiggle moving toward a backslash/command cue.
8. `08-scanner-brackets.png` — drawn glyph inside scanner/focus brackets.
9. `09-stroke-to-symbol.png` — pencil stroke transforming into a clean math glyph.
10. `10-copy-result-token.png` — sketched glyph with abstract copied-result token.

Third pass, exploring the preferred directions:

11. `11-magnifier-sigma-v2.png` — magnifier over a bold hand-drawn sigma/sum glyph.
12. `12-magnifier-integral-v3.png` — magnifier over integral/infinity-like glyph with recognition sparkle.
13. `13-sigma-spark-v2.png` — tighter bold sigma/sum glyph with gold sparkle.
14. `14-sigma-ring-v3.png` — sigma/sum glyph with teal recognition ring segments.
15. `15-scanner-infinity-v2.png` — scanner/focus brackets around a recognizable infinity symbol.
16. `16-scanner-integral-v3.png` — scanner/focus brackets around a recognizable integral symbol.

Fourth pass, simplifying the original Detexify icon idea:

17. `17-split-integral-scan.png` — rough handwritten integral on the left, vertical scan line, cleaned integral on the right.
18. `18-split-infinity-scan.png` — rough handwritten infinity on the left, vertical scan line, cleaned infinity on the right.
19. `19-split-sigma-scan.png` — rough handwritten sigma/sum on the left, vertical scan line, cleaned sigma/sum on the right.

Fifth pass, sharpened single-symbol split with left-to-right scan trail:

20. `20-split-infinity-trail.png` — one infinity symbol split by scanline, rough left half, clean right half, visible teal trail.
21. `21-split-integral-trail.png` — one integral symbol split by scanline, rough lower/left part, clean upper/right part, visible teal trail.
22. `22-split-sigma-trail.png` — one sigma/sum symbol split by scanline, rough left half, clean right half, visible teal trail.

Sixth pass, corrected direction: scanned/typeset on the left, still-handwritten on the right:

23. `23-split-sigma-reverse-a.png` — sum-like sigma, clean typeset left side, rough handwritten right side, left-side scan trail.
24. `24-split-sigma-reverse-b.png` — bolder sigma reroll with stronger crop and rougher right side.
25. `25-split-sigma-reverse-c.png` — simplified angular sigma reroll with minimal trail.
26. `26-split-integral-reverse-a.png` — integral reroll, clean lower/left curve, rough upper/right curve.
27. `27-split-integral-reverse-b.png` — taller integral reroll with rough right/top stroke.
28. `28-split-sqrt-reverse.png` — square-root/radical reroll with clean left hook and rough right bar.

Seventh pass, candidate 23 with blue ballpoint handwritten side:

29. `29-split-sigma-blue-a.png` — candidate-23-like sigma split, black typeset left, blue ballpoint right.
30. `30-split-sigma-blue-b.png` — wobblier blue handwritten right half.
31. `31-split-sigma-blue-c.png` — cleaner/minimal blue right half for small favicon use.

Eighth pass, candidate 30 with thicker blue brush/marker strokes:

32. `32-split-sigma-blue-brush-a.png` — candidate-30-like split with thick blue brush stroke right side.
33. `33-split-sigma-blue-brush-b.png` — more organic rounded blue brush right side.
34. `34-split-sigma-blue-brush-c.png` — most minimal/favicon-readable blue brush right side.

Ninth pass, final brush geometry refinement:

35. `35-split-sigma-final-brush-a.png` — candidate-32 brush style with refined sigma geometry.
36. `36-split-sigma-final-brush-b.png` — cleaner/geometric sigma with thick blue brush right side.
37. `37-split-sigma-final-brush-c.png` — minimal/favicon version of the blue-brush split.

Tenth pass, explicit non-mirrored sigma geometry:

38. `38-split-sigma-nomirror-a.png` — non-mirrored sigma with blue brush right arm ends.
39. `39-split-sigma-nomirror-b.png` — stronger favicon silhouette, geometric black left, blue right arm ends.
40. `40-split-sigma-nomirror-c.png` — organic blue brush right side while avoiding mirrored geometry.

## Shared prompt constraints

Square app-icon/favicon candidate for Detexify Next, a handwriting-to-LaTeX symbol recognizer. High contrast, small-size readable, no readable words, no D/T letters, no UI screenshots, no photorealistic hands, no watermark, no shadows outside the icon, simple centered mark, warm paper/cream and dark ink/teal palette, crisp vector-friendly illustration.
