# Adding Symbols

Use the symbol-add CLI for new symbols. It updates canonical source metadata, optionally creates an empty sample file, renders the SVG asset, and runs validation.

## Recommended workflow

Command:

```bash
npm run data:add-symbol -- \
  --command "\\leqslant" \
  --package amssymb \
  --mode math
```

The CLI:

- generate a stable canonical symbol id;
- reject duplicate/conflicting commands;
- add or update `packages/data/source/symbols.json`;
- create a sample file/manifest entry if needed;
- render the symbol SVG;
- run validation;
- print a PR-friendly summary.

Useful options:

```bash
# Explicit id if automatic slugging is not what you want.
npm run data:add-symbol -- \
  --id latex:amssymb:leqslant \
  --command "\\leqslant" \
  --package amssymb \
  --mode math

# Create an empty sample JSONL/manifest entry immediately.
npm run data:add-symbol -- \
  --command "\\leqslant" \
  --package amssymb \
  --mode math \
  --with-sample-file

# Add metadata without rendering, useful when debugging unsupported packages.
npm run data:add-symbol -- \
  --command "\\foo" \
  --package somepkg \
  --mode math \
  --no-render
```

Batch mode is still desirable later:

```bash
npm run data:add-symbols -- --from new-symbols.json
```

## Manual maintainer fallback

If the CLI cannot handle an unusual case, manually add a `SourceSymbol` entry to:

   ```text
   packages/data/source/symbols.json
   ```

2. Use a canonical id like:

   ```text
   latex:<package-or-latex2e>:<command-name>
   ```

   Examples:

   ```text
   latex:latex2e:infty
   latex:amssymb:leqslant
   ```

3. Fill render metadata:

   ```json
   {
     "id": "latex:amssymb:leqslant",
     "command": "\\leqslant",
     "package": "amssymb",
     "fontenc": "OT1",
     "mode": "math",
     "render": {
       "command": "\\leqslant",
       "package": "amssymb",
       "fontenc": "OT1",
       "mode": "math"
     }
   }
   ```

4. Render assets:

   ```bash
   npm run render:symbols
   ```

5. Validate:

   ```bash
   npm run validate:data
   ```

6. Run the web app and inspect:

   ```bash
   npm run dev:web
   # open /#/symbols and search for the new command
   ```

7. Add samples through the training UI if possible:

   ```text
   /#/train
   ```

## PR expectations

For symbol PRs:

- include the source symbol metadata;
- include rendered SVG asset produced by the renderer;
- include at least a few handwriting samples if practical;
- do not edit generated web data by hand unless the project decides to keep it committed for that release path;
- include notes if a symbol requires unusual LaTeX packages or does not render with Tectonic.

## Visual review

Data PRs that touch `packages/data/source/**` get an automatic GitHub Action
comment with:

- added/changed symbols;
- rendered glyph previews;
- sample contact sheets;
- validation summary;
- links to downloadable artifacts.

See [pr-previews.md](./pr-previews.md).
