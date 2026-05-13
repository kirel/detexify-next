# Adding Symbols

A polished symbol-add CLI is planned but not implemented yet. Until it exists, adding symbols is a maintainer-level workflow because it touches canonical metadata, rendered assets, and sample manifests.

## Future intended workflow

Planned command:

```bash
npm run data:add-symbol -- \
  --command "\\leqslant" \
  --package amssymb \
  --mode math
```

The CLI should:

- generate a stable canonical symbol id;
- reject duplicate/conflicting commands;
- add or update `packages/data/source/symbols.json`;
- create a sample file/manifest entry if needed;
- render the symbol SVG;
- run validation;
- print a PR-friendly summary.

Batch mode is also desirable later:

```bash
npm run data:add-symbols -- --from new-symbols.json
```

## Current maintainer workflow

1. Add a `SourceSymbol` entry to:

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

For future external symbol PRs:

- include the source symbol metadata;
- include rendered SVG asset produced by the renderer;
- include at least a few handwriting samples if practical;
- do not edit generated web data by hand unless the project decides to keep it committed for that release path;
- include notes if a symbol requires unusual LaTeX packages or does not render with Tectonic.

## Visual review coming soon

Data PRs should eventually get an automatic GitHub comment with:

- added/changed symbols;
- rendered glyph previews;
- sample contact sheets;
- validation summary;
- links to downloadable artifacts.

See [pr-previews.md](./pr-previews.md).
