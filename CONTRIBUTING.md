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

The project is still preparing its full open-source data contribution workflow. Visual PR previews and safer symbol-add tooling are planned but not implemented yet.
