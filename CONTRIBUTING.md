# Contributing

## Prerequisites

- Node.js 22+
- pnpm 10+

## Setup

```bash
pnpm install
```

## Local Validation

```bash
pnpm check
pnpm test
pnpm build
```

## Publishing Checklist

1. Update version in package.json.
2. Update CHANGELOG.md.
3. Run validation commands.
4. Publish with:

```bash
pnpm publish --access public --provenance
```

The prepublishOnly script also runs check, test, and build.
