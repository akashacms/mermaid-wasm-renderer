# AGENTS.md - mermaid-wasm-renderer

Instructions for LLM coding agents working in this repository.

## What this project is

This repository packages [mermaid-rs-renderer](https://github.com/1jehuang/mermaid-rs-renderer) (a pure-Rust Mermaid diagram renderer, upstream binary name `mmdr`) as a WebAssembly npm package for Node.js. It exists so that Node.js applications (notably [@akashacms/diagram-makers](https://github.com/akashacms/plugins-diagrams)) can render Mermaid diagrams to SVG in-process, in milliseconds, without Chromium/Puppeteer and without platform-specific binaries.

Key design facts:

- **Version policy: this package's version tracks the embedded mermaid-rs-renderer version.** When updating the vendored upstream to version X.Y.Z, set `version = "X.Y.Z"` in both the top-level `Cargo.toml` and the top-level `package.json`, then rebuild so the generated `pkg/package.json` picks it up. (`pkg/package.json` is generated from `Cargo.toml` by wasm-pack; never hand-edit it.)
- Target is `wasm32-unknown-unknown` via wasm-bindgen/wasm-pack, **not** WASI. There is no filesystem inside the WASM module; anything file-like (fonts, config files) must be read by the JavaScript host and passed in as bytes/strings.
- The upstream crate is used with `default-features = false`, which disables its `cli` (clap) and `png` (resvg/usvg) features. Output is SVG strings only.
- Text measurement uses `fontdb`. Without fonts, upstream falls back to calibrated approximate metrics, so rendering works even with zero registered fonts; registering a font gives exact label sizing.

## Repository layout

```
Cargo.toml                  wasm-bindgen wrapper crate (this repo's own Rust code)
src/lib.rs                  the entire wrapper: renderSvg, renderSvgWithConfig, registerFont
patches/mermaid-rs-renderer-wasm.patch   WASM-support patch applied to upstream
vendor/mermaid-rs-renderer/ clone of upstream (NOT committed; .gitignore'd; see below)
pkg/                        wasm-pack build output (COMMITTED - see below)
test/smoke.mjs              Node.js smoke test (run with: npm test)
package.json                npm metadata for installing this repo from git
README.md                   human-facing project documentation
README-npm.md               source of pkg/README.md (npm-facing documentation)
```

Two things that surprise people:

1. **`pkg/` is committed.** Consumers install with `npm install github:akashacms/mermaid-wasm-renderer`, which delivers the repo root. They must not need a Rust toolchain, so the built `.wasm` + JS glue are checked in. After any rebuild, commit the changed `pkg/` files.
2. **`vendor/` is NOT committed.** It is a plain clone of upstream plus the patch. Anyone (including you) must recreate it; see the next section.

## Setting up vendor/ from scratch

The pinned upstream commit that `patches/mermaid-rs-renderer-wasm.patch` was generated against is recorded in README.md ("Setting up the renderer source" section). As of this writing it is `2f993bd` (v0.3.1).

```sh
git clone https://github.com/1jehuang/mermaid-rs-renderer vendor/mermaid-rs-renderer
git -C vendor/mermaid-rs-renderer checkout <PINNED-COMMIT>
git -C vendor/mermaid-rs-renderer apply "$(pwd)/patches/mermaid-rs-renderer-wasm.patch"
```

Do NOT use `--depth 1` for the clone: once upstream advances, a shallow clone will not contain the pinned commit.

## What the patch does

`patches/mermaid-rs-renderer-wasm.patch` makes three changes to upstream, all required for `wasm32-unknown-unknown`:

1. **`src/timing.rs` (new file) + import rewrites.** `std::time::Instant::now()` PANICS at runtime on wasm32-unknown-unknown ("time not implemented on this platform"). Upstream uses it for stage-timing metrics inside the layout hot path. The shim re-exports `std::time::Instant` on native targets and substitutes a zero-duration stub on wasm. The patch rewrites `use std::time::Instant;` to `use crate::timing::Instant;` in `src/layout/mod.rs`, `src/layout/flowchart/edge_pipeline.rs`, and inside `render_with_detailed_timing` in `src/lib.rs`. (`src/cli.rs` also uses Instant but is behind the disabled `cli` feature.)

2. **`src/text_metrics.rs`: `register_font_data(Vec<u8>)` (new public fn, re-exported from `src/lib.rs`).** Upstream populates its `fontdb::Database` with `load_system_fonts()`, a silent no-op on wasm. This function lets the host inject TTF/OTF bytes via `fontdb::Database::load_font_data`, points the generic CSS families (`sans-serif`, `monospace`, ...) at the first registered font, and clears the measurement cache.

3. **`src/config.rs`: `config_from_str()` (new public fn).** Upstream's `load_config_with_theme()` reads JSON config from a file path. The patch splits the (large) parse-and-apply body into `config_from_str(contents, cli_theme)` so WASM callers can pass configuration as a string. `load_config_with_theme` becomes a thin file-reading wrapper around it.

The wrapper (`src/lib.rs` in THIS repo) depends on items 2 and 3 (`mermaid_rs_renderer::register_font_data`, `mermaid_rs_renderer::config::config_from_str`), so an unpatched upstream will not compile against the wrapper.

## Recomputing the patch after an upstream update

This is the most delicate maintenance task. Upstream moves quickly; the patch will eventually stop applying cleanly or become semantically stale.

### Procedure

1. Start from a clean vendor clone at the NEW upstream commit you want to adopt:

   ```sh
   git -C vendor/mermaid-rs-renderer fetch origin
   git -C vendor/mermaid-rs-renderer checkout <NEW-COMMIT>   # e.g. origin/master
   git -C vendor/mermaid-rs-renderer reset --hard <NEW-COMMIT>
   ```

2. Apply the existing patch, using 3-way merge if a plain apply fails:

   ```sh
   git -C vendor/mermaid-rs-renderer apply "$(pwd)/patches/mermaid-rs-renderer-wasm.patch" \
     || git -C vendor/mermaid-rs-renderer apply --3way "$(pwd)/patches/mermaid-rs-renderer-wasm.patch"
   ```

   Resolve any conflicts by hand, keeping the intent of the three changes described above.

3. **Re-audit for NEW wasm hazards introduced upstream.** The patch fixed the hazards that existed at the pinned commit; new upstream code may add more. Check for:

   ```sh
   # Instant usage outside cli.rs must go through crate::timing
   rg -n 'std::time::Instant|Instant::now' vendor/mermaid-rs-renderer/src --glob '!cli.rs'
   # New filesystem/env access in the render path (fs::read of fonts/config, etc.).
   # fs calls that fail gracefully (cache lookups) are OK; fs calls whose failure
   # breaks rendering are not.
   rg -n 'std::fs|std::env' vendor/mermaid-rs-renderer/src --glob '!cli.rs' --glob '!config.rs'
   # SystemTime also panics on wasm
   rg -n 'SystemTime' vendor/mermaid-rs-renderer/src --glob '!cli.rs'
   ```

   Any new `Instant` import in library code should be rewritten to `use crate::timing::Instant;` and becomes part of the patch.

4. Update the package version to match the new upstream version (see the version policy above): set `version` in the top-level `Cargo.toml` AND the top-level `package.json` to the upstream crate version (found in `vendor/mermaid-rs-renderer/Cargo.toml`). The `npm run build` in the next step regenerates `pkg/package.json` with the new version.

5. Verify both targets compile, then build and test end-to-end:

   ```sh
   (cd vendor/mermaid-rs-renderer && cargo check --no-default-features --target wasm32-unknown-unknown)
   (cd vendor/mermaid-rs-renderer && cargo check --no-default-features)
   (cd vendor/mermaid-rs-renderer && cargo test --no-default-features)
   npm run build
   npm test
   ```

   The smoke test matters: compilation cannot catch runtime panics such as `Instant::now()` on wasm.

6. Regenerate the patch from the vendor working tree. The `git add -N` (intent-to-add) is required so that NEW files (like `src/timing.rs`) appear in `git diff`:

   ```sh
   cd vendor/mermaid-rs-renderer
   git add -N src/timing.rs        # repeat for any other new files
   git diff > ../../patches/mermaid-rs-renderer-wasm.patch
   cd ../..
   ```

7. Sanity-check the regenerated patch against a pristine clone:

   ```sh
   rm -rf /tmp/mrr-verify
   git clone -q https://github.com/1jehuang/mermaid-rs-renderer /tmp/mrr-verify
   git -C /tmp/mrr-verify checkout <NEW-COMMIT>
   git -C /tmp/mrr-verify apply --stat "$(pwd)/patches/mermaid-rs-renderer-wasm.patch"
   git -C /tmp/mrr-verify apply "$(pwd)/patches/mermaid-rs-renderer-wasm.patch"
   ```

8. Update the pinned commit hash in **README.md** (the "Setting up the renderer source" section) and in this file if the value above is stale.

9. Commit together: `patches/`, the rebuilt `pkg/`, README.md, `Cargo.toml`/`package.json` (version bump), and any wrapper changes. Never commit `vendor/`.

### If upstream absorbs the patch

All three changes are candidates for upstreaming. If upstream merges an equivalent (check for `register_font_data`, `config_from_str`, or a timing shim in their tree), remove the corresponding hunks from the patch rather than carrying duplicates, and adapt the wrapper's `src/lib.rs` to upstream's actual API names/paths if they differ.

## Building

Prerequisites (one-time):

```sh
rustup target add wasm32-unknown-unknown
npm install   # provides wasm-pack and shx as devDependencies
```

`wasm-pack` and `shx` are devDependencies, so `npm install` supplies them (in `node_modules/.bin`) and `npm run build` finds them on the npm-script PATH without a global install. `npm install` runs wasm-pack's postinstall, which downloads the wasm-pack binary; if your environment blocks install scripts, the npm shim downloads it lazily on first `wasm-pack` invocation instead. Either way, the Rust toolchain (`cargo`, `rustc`, and the `wasm32-unknown-unknown` target) must be installed separately — a devDependency cannot provide it.

Build:

```sh
npm run build
```

This runs `wasm-pack build --target nodejs --release --out-dir pkg`, then copies `README-npm.md` over `pkg/README.md` (wasm-pack clobbers it with the root README) via `shx cp`, then deletes `pkg/.gitignore` (wasm-pack generates one containing `*`, which would prevent committing `pkg/`) via `shx rm`. If you invoke wasm-pack manually, do not forget those two follow-up steps. `shx` keeps both cross-platform.

The first build is slow (several minutes); wasm-pack also downloads a matching wasm-bindgen and wasm-opt on first use.

## Testing

```sh
npm test        # runs node test/smoke.mjs
```

The smoke test renders flowchart/sequence/class/pie diagrams with and without a registered font, exercises `renderSvgWithConfig` with a theme preset, verifies invalid input throws a catchable `Error`, and writes output SVGs to `test/output/`. Extend it when adding API surface.

## The JavaScript API surface

Defined in `src/lib.rs`, exported through the wasm-bindgen glue in `pkg/`:

- `renderSvg(source: string): string` - render with the default (modern) theme.
- `renderSvgWithConfig(source: string, configJson?: string, themePreset?: string): string` - `configJson` uses upstream's `--config` JSON schema; `themePreset` is one of `default | dark | forest | neutral | modern` and takes precedence over the config's `theme` name but is applied before `themeVariables`.
- `registerFont(data: Uint8Array): void` - register TTF/OTF bytes; first registration also backs the generic CSS families.

Errors are thrown as JavaScript `Error` (via `JsError`). Keep this API stable; @akashacms/diagram-makers depends on all three functions.

## Publishing

- **git install (primary path):** consumers use `github:akashacms/mermaid-wasm-renderer`; the top-level `package.json` points `main`/`types` into `pkg/`. This only works if `pkg/` is committed and current - rebuild and commit `pkg/` whenever the Rust code or patch changes.
- **npm registry (optional):** `cd pkg && npm publish` uses the wasm-pack-generated `pkg/package.json`. Note that `pkg/package.json` is regenerated from `Cargo.toml` on every build; do not hand-edit it.

## Gotchas checklist

- Never use `std::time::Instant`, `SystemTime::now()`, `std::fs`, or `std::env` in code that executes on wasm - there is no OS. Fonts/config come across the JS boundary.
- `wasm-pack build` overwrites `pkg/README.md` and recreates `pkg/.gitignore`; `npm run build` fixes both.
- The vendor clone must not be shallow (pinned-commit checkout breaks later).
- `Cargo.toml` pins `default-features = false` for the upstream dependency; enabling defaults drags in clap and resvg/usvg. (`png` is believed wasm-compatible if PNG output is ever wanted, but is untested here.)
- If the borrow checker complains inside `register_font_data`-style code touching `fontdb`, remember `db.faces()` borrows the db; collect needed values before calling `db.set_*_family()`.
