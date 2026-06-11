# Related Work

This project sits in a small but active ecosystem of handwritten symbol
recognizers and editor symbol pickers. The main lesson from the current review
is that Detexify Next should not only be a refreshed recognizer. It should be a
web-first, embeddable, target-aware symbol recognition layer for LaTeX-adjacent
tools.

## Hand-TeX

- Repository: https://github.com/VoxelCubes/Hand-TeX
- Product shape: offline desktop application for handwritten LaTeX symbol
  recognition.
- Stack: Python, PySide6, PyTorch.
- License: GPL-3.0 for code. The released training database is published with
  an ODbL license file.
- Distribution: PyPI package, Windows build, Flatpak, AUR.

Hand-TeX is the strongest adjacent project on the desktop-recognizer axis. It
supports more symbols than historical Detexify, publishes a compact trained
model, and includes a built-in workflow for collecting additional training
drawings.

Architecture notes:

- strokes are rasterized to a 64x64 grayscale image;
- the production model is a compact direct CNN classifier;
- the model ignores stroke order and direction by design;
- weights are shipped as `handtex.safetensors`;
- output is a ranked list of LaTeX-oriented symbol identifiers.

Strategic impact:

- Hand-TeX reduces the value of building a standalone desktop LaTeX recognizer
  from scratch.
- It is valuable as an external benchmark and potential collaboration point.
- Direct reuse requires a deliberate licensing decision because GPL and ODbL
  are materially different from the likely Detexify Next licensing direction.

## Detypify

- Repository: https://github.com/QuarticCat/detypify
- App: https://detypify.quarticcat.com/
- Service package: https://www.npmjs.com/package/detypify-service
- Product shape: Typst symbol classifier as a PWA plus embeddable npm service.
- License: MIT.

Detypify is the clearest modern example of the product architecture Detexify
Next should learn from. It is not just a website: it splits the recognizer into
a reusable browser service package and a UI, ships an installable offline PWA,
and exposes target-specific Typst metadata.

Architecture notes:

- browser inference uses ONNX Runtime Web;
- the npm package exposes a small API: create a session, pass strokes, receive
  scores;
- the model is trained in Python with PyTorch Lightning and `timm`
  MobileNetV4 variants;
- the dataset pipeline maps MathWriting, Detexify, and contributed data into
  Typst symbol classes;
- Typst symbol metadata is generated from the Typst documentation;
- a Cloudflare Worker accepts contributed samples;
- a scheduled GitHub Action refreshes upstream symbol metadata and can trigger
  retraining.

Strategic impact:

- Typst is already well served by a Detexify-like tool.
- The reusable service-package approach is a strong blueprint for Detexify
  Next.
- Detexify Next should treat Typst support as one target profile, not as the
  primary differentiator.

## extexify

- Repository: https://github.com/J3698/extexify
- Product shape: Overleaf browser extension for drawing LaTeX symbols and
  inserting commands.
- Status: appears inactive; created and last pushed in 2021.
- License: no license metadata found in the GitHub repository response.

extexify validates the Overleaf integration idea: drawing a symbol directly in
the editor and inserting the suggested command is a natural workflow. It does
not appear to be an active foundation to build on.

Strategic impact:

- Overleaf integration is a real use case.
- The durable form should likely be an embeddable Detexify service or widget,
  not a one-off extension tightly coupled to one editor.

## Overleaf Symbol Palette

- Docs: https://docs.overleaf.com/writing-and-editing/inserting-symbols

Overleaf has a built-in Symbol Palette for browsing and searching common
symbols. It is a premium feature and can show required packages. It is not a
handwriting recognizer.

Strategic impact:

- Overleaf has solved browsing/search for common symbols, not drawn-symbol
  recognition.
- A Detexify integration should focus on recognition, package hints, and
  insert-ready output.

## Target Systems

Detexify Next should represent symbol capabilities explicitly instead of
treating every result as only a LaTeX command.

Useful target profiles:

- `latex`: command, package, mode, rendered preview.
- `katex`: only commands supported by KaTeX, with fallback alternatives.
- `mathjax`: MathJax-compatible command profile.
- `typst`: Typst names, shorthands, Unicode characters.
- `quarto-html-katex`: KaTeX-compatible Markdown/HTML output.
- `quarto-pdf-latex`: LaTeX-compatible PDF output.
- `unicode`: direct character output when appropriate.

Result metadata should support:

- insertion text;
- display label;
- required package or target compatibility;
- confidence score;
- rendered preview;
- fallback or related symbols;
- documentation links where available.

## Positioning

Detexify Next should be positioned as:

> A web-first, offline-capable, embeddable Detexify successor for LaTeX and
> LaTeX-adjacent writing environments.

The strongest differentiator is not simply a new recognizer. It is combining
recognition with target-aware symbol metadata and editor-friendly integration.

Near-term implications:

- keep the web app and macOS app useful as standalone products;
- extract a small browser recognizer/service package;
- make output target profiles part of the data model;
- keep the classifier backend pluggable;
- use Hand-TeX and Detypify as external references and benchmarks;
- avoid accidental GPL/ODbL coupling unless intentionally choosing that path.
