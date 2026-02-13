# new

A Bun-based CLI that scaffolds a new Bun TypeScript project.
Scaffold files are cloned from `https://github.com/rayhanadev/fresh`.
The CLI requires `git` to be installed and available on your PATH.
The default template includes `effect`, `vitest`, `oxlint`, and `oxfmt` setup.
It also includes Factory Oxlint plugin rules directly in `.oxlintrc.json`.
It includes `@rayhanadev/env` with a starter `src/env.ts` configuration.

## Setup this CLI locally

Install dependencies and link the command:

```bash
bun install
bun link
```

Now `new` is available in your shell.

## Usage

Create into a new directory:

```bash
new my-app
```

Create into a specific path:

```bash
new --path ./apps/my-app
```

Create into current directory (must be empty):

```bash
new
```

Options:

- `-f`, `--force` overwrite a non-empty target directory
- `-p`, `--path` target directory path
- `--no-install` scaffold without running `bun install`
- `-h`, `--help` show help
- `-v`, `--version` show CLI version
