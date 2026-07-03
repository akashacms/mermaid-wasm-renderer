# mermaid-wasm-renderer (build project)

This repository builds the [`mermaid-wasm-renderer`](README-npm.md) npm package: a WebAssembly build of [mermaid-rs-renderer](https://github.com/1jehuang/mermaid-rs-renderer) (a pure-Rust Mermaid renderer) with [wasm-bindgen](https://github.com/rustwasm/wasm-bindgen) bindings, so Node.js applications can render Mermaid diagrams to SVG in milliseconds without a browser, Puppeteer, or platform-specific binaries.

It was created to replace the `@mermaid-js/mermaid-cli` dependency in [@akashacms/diagrams-maker](https://github.com/akashacms/plugins-diagrams), which spawns a headless Chromium per diagram.

## Repository layout

```
Cargo.toml                  wasm-bindgen wrapper crate
src/lib.rs                  JS-facing API: renderSvg, renderSvgWithConfig, registerFont
vendor/mermaid-rs-renderer/ vendored clone of the upstream renderer (patched, see below)
pkg/                        build output: the npm package (wasm + JS glue + .d.ts)
test/smoke.mjs              Node.js smoke test
README-npm.md               source of pkg/README.md (the npm-facing README)
```

## Patches applied to the vendored crate

The upstream crate compiles for `wasm32-unknown-unknown` almost unmodified. Three small changes were needed, all candidates for upstreaming:

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
wasm-pack build --target nodejs --release --out-dir pkg
cp README-npm.md pkg/README.md
```

Note: `wasm-pack` copies this top-level `README.md` into `pkg/` as part of the build, so the `cp` afterwards is required to give the npm package its own README.

## Testing

```sh
node test/smoke.mjs
```

Renders flowchart, sequence, class, and pie diagrams (with and without a registered font, and with a dark-theme config), writes the SVGs to `test/output/`, and checks that invalid input throws a catchable `Error`.

## Publishing

```sh
wasm-pack build --target nodejs --release --out-dir pkg
cp README-npm.md pkg/README.md
node test/smoke.mjs
cd pkg && npm publish
```

## License

MIT, same as the upstream renderer.
