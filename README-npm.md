# mermaid-wasm-renderer

Fast [Mermaid](https://mermaid.js.org/) diagram rendering for Node.js — no browser, no Puppeteer, no native binaries.

This is a WebAssembly build of [mermaid-rs-renderer](https://github.com/1jehuang/mermaid-rs-renderer), a Mermaid renderer written in pure Rust. It parses Mermaid source and produces SVG directly, rendering a typical diagram in **1–3 milliseconds** — compared to ~2 seconds per diagram for `@mermaid-js/mermaid-cli`, which launches a headless Chromium for every render.

Because it is plain WASM + JavaScript, it installs identically on every platform: no postinstall downloads, no platform-specific prebuilt binaries, no node-gyp.

## Install

```sh
npm install mermaid-wasm-renderer
```

## Quick start

CommonJS:

```js
const { renderSvg } = require('mermaid-wasm-renderer');

const svg = renderSvg('flowchart LR; A-->B-->C');
```

ESM (named imports work through Node's CommonJS interop):

```js
import { renderSvg, renderSvgWithConfig, registerFont } from 'mermaid-wasm-renderer';

const svg = renderSvg('flowchart LR; A-->B-->C');
```

Parse errors throw a regular JavaScript `Error`:

```js
try {
    renderSvg('not a diagram');
} catch (err) {
    console.error(err.message); // "unexpected token ... at 1:1"
}
```

## Fonts

WebAssembly has no filesystem access, so the renderer cannot discover system fonts on its own. Text is measured with calibrated fallback metrics by default, which produces good (but approximate) label sizing.

For exact text measurement, read a TTF/OTF file in Node.js and register its bytes before rendering:

```js
import { readFileSync } from 'node:fs';
import { registerFont, renderSvg } from 'mermaid-wasm-renderer';

registerFont(readFileSync('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'));

const svg = renderSvg('flowchart LR; A[Label widths now exact] --> B');
```

The first registered font also becomes the target of the generic CSS families (`sans-serif`, `monospace`, ...), so themes that reference only generic families resolve to a real face. You may register multiple fonts; register them all before the first render.

## Configuration and themes

`renderSvgWithConfig(source, configJson?, themePreset?)` accepts the same JSON schema as the upstream `mmdr --config` file:

```js
const svg = renderSvgWithConfig(
    'flowchart TD; A-->B',
    JSON.stringify({
        themeVariables: {
            primaryColor: '#F8FAFF',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 13,
        },
        flowchart: {
            nodeSpacing: 60,
            rankSpacing: 80,
        },
    }),
    'dark', // optional theme preset: default | dark | forest | neutral | modern
);
```

The theme preset takes precedence over the config's `theme` name but is applied before `themeVariables`, so fine-grained variable overrides still win.

## API

| Function | Description |
| --- | --- |
| `renderSvg(source: string): string` | Render Mermaid source to SVG with the default (modern) theme. |
| `renderSvgWithConfig(source: string, configJson?: string, themePreset?: string): string` | Render with a JSON config and/or named theme preset. |
| `registerFont(data: Uint8Array): void` | Register TTF/OTF font bytes for exact text measurement. |

TypeScript declarations are included.

## Supported diagram types

Inherited from mermaid-rs-renderer (23 types): flowchart/graph, sequence, class, state (v2), ER, pie, gantt, journey, timeline, mindmap, gitGraph, xychart-beta, quadrantChart, sankey-beta, kanban, C4, block-beta, architecture-beta, requirement, zenuml, packet-beta, radar-beta, and treemap.

Note: upstream is under active development; visual output may not yet match mermaid-cli in every case.

## Performance

The first render costs ~150 ms (one-time WASM/regex/font warm-up). Every render after that takes single-digit milliseconds. Rendering happens synchronously in-process — no child processes, no browser.

## License

MIT. Rendering engine © the [mermaid-rs-renderer](https://github.com/1jehuang/mermaid-rs-renderer) contributors, also MIT.
