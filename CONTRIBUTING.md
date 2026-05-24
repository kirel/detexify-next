# Contributing to Detexify Next

Thanks for helping improve Detexify Next.

Start with the contributor docs:

- [docs/contributing.md](./docs/contributing.md)
- [docs/adding-symbols.md](./docs/adding-symbols.md)
- [docs/adding-samples.md](./docs/adding-samples.md)
- [docs/reviewing-samples.md](./docs/reviewing-samples.md)
- [docs/pr-previews.md](./docs/pr-previews.md)

Before opening a PR, run:

```bash
npm run validate:data
npm run typecheck
npm test
npm --workspace @detexify/web run build
```

The core data contribution workflow now exists. Use `data:add-symbol` for new symbols, `/#/train` for samples/review, and the data PR preview workflow for visual review of source-data changes. The remaining public-launch work is license cleanup and contributor polish.
