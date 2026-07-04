# mermaid-wasm-renderer (build project)

This repository builds the [`mermaid-wasm-renderer`](README-npm.md) npm package: a WebAssembly build of [mermaid-rs-renderer](https://github.com/1jehuang/mermaid-rs-renderer) (a pure-Rust Mermaid renderer) with [wasm-bindgen](https://github.com/rustwasm/wasm-bindgen) bindings, so Node.js applications can render Mermaid diagrams to SVG in milliseconds without a browser, Puppeteer, or platform-specific binaries.

It was created to replace the `@mermaid-js/mermaid-cli` dependency in [@akashacms/diagrams-maker](https://github.com/akashacms/plugins-diagrams), which spawns a headless Chromium per diagram.

## Repository layout

```
Cargo.toml                  wasm-bindgen wrapper crate
package.json                npm metadata for installing this repo from git
src/lib.rs                  JS-facing API: renderSvg, renderSvgWithConfig, registerFont
patches/                    WASM-support patch for the upstream renderer (see below)
vendor/mermaid-rs-renderer/ clone of the upstream renderer (not committed; see setup)
pkg/                        build output: wasm + JS glue + .d.ts (committed, see below)
test/smoke.mjs              Node.js smoke test
README-npm.md               source of pkg/README.md (the npm-facing README)
```

The `pkg/` build output is committed so that the package can be installed directly from the git repository without consumers needing a Rust toolchain:

```sh
npm install github:akashacms/mermaid-wasm-renderer
```

The top-level `package.json` exists for this git-install path (`main` points into `pkg/`). Publishing to the npm registry uses `pkg/package.json` instead (see Publishing). After rebuilding, commit the updated `pkg/` contents.

## Setting up the renderer source

The upstream renderer is not committed to this repository. Clone it yourself, either inside this directory or as a sibling, then apply the WASM-support patch.

**Option A — clone inside this directory** (the location `Cargo.toml` expects):

```sh
git clone https://github.com/1jehuang/mermaid-rs-renderer vendor/mermaid-rs-renderer
git -C vendor/mermaid-rs-renderer checkout bac530c   # known-good commit for the patch (v0.3.0)
git -C vendor/mermaid-rs-renderer apply "$(pwd)/patches/mermaid-rs-renderer-wasm.patch"
```

**Option B — clone as a sibling directory**, then symlink it into place:

```sh
git clone https://github.com/1jehuang/mermaid-rs-renderer ../mermaid-rs-renderer
git -C ../mermaid-rs-renderer checkout bac530c
git -C ../mermaid-rs-renderer apply "$(pwd)/patches/mermaid-rs-renderer-wasm.patch"
mkdir -p vendor
ln -s ../../mermaid-rs-renderer vendor/mermaid-rs-renderer
```

The `checkout bac530c` pin is the commit the patch was generated against; upstream moves quickly, so the patch may need rebasing on newer commits (`git apply --3way` usually resolves it).

## Patches applied to the renderer

The upstream crate compiles for `wasm32-unknown-unknown` almost unmodified. `patches/mermaid-rs-renderer-wasm.patch` contains the three small changes that were needed, all candidates for upstreaming:

1. **`src/timing.rs` (new) + import changes** — `std::time::Instant::now()` panics at runtime on `wasm32-unknown-unknown`, and it was used for stage-timing metrics inside the layout path (`layout/mod.rs`, `layout/flowchart/edge_pipeline.rs`, `lib.rs`). The shim re-exports `std::time::Instant` on native targets and substitutes a zero-duration stub on wasm.

2. **`src/text_metrics.rs`: `register_font_data(Vec<u8>)` (new, re-exported from `lib.rs`)** — text measurement uses a `fontdb::Database` populated by `load_system_fonts()`, which is a silent no-op on wasm (no filesystem). This function lets the host inject TTF/OTF bytes with `fontdb::Database::load_font_data`, and points the generic CSS families (`sans-serif`, ...) at the first registered font. Without registered fonts, rendering still works via the crate's built-in calibrated fallback metrics.

3. **`src/config.rs`: `config_from_str()` (new)** — the config loader (`load_config_with_theme`) read JSON from a file path; the parsing/applying body is now reachable from a string so WASM callers can pass configuration without a filesystem.

## Building

Prerequisites:

```sh
rustup target add wasm32-unknown-unknown
# wasm-pack: https://rustwasm.github.io/wasm-pack/installer/
```

Build the npm package into `pkg/`:

```sh
npm run build
```

which runs:

```sh
wasm-pack build --target nodejs --release --out-dir pkg
cp README-npm.md pkg/README.md
rm -f pkg/.gitignore
```

The `cp` is required because `wasm-pack` copies this top-level `README.md` into `pkg/` as part of the build, and the npm package needs its own README. The `rm` removes the `.gitignore` that `wasm-pack` generates, which would otherwise prevent committing `pkg/` (needed for git installs).

## Testing

```sh
node test/smoke.mjs
```

Renders flowchart, sequence, class, and pie diagrams (with and without a registered font, and with a dark-theme config), writes the SVGs to `test/output/`, and checks that invalid input throws a catchable `Error`.

## Publishing

```sh
npm run build
npm test
cd pkg && npm publish
```

## License

MIT, same as the upstream renderer.
