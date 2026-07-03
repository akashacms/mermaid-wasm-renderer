// Smoke test: render several diagram types from Node.js via the WASM build.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { renderSvg, renderSvgWithConfig, registerFont } = require('../pkg/mermaid_wasm_renderer.js');

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'output');
mkdirSync(outDir, { recursive: true });

const diagrams = {
    flowchart: `flowchart LR
    A[Start] --> B{Is it working?}
    B -->|Yes| C[Ship it]
    B -->|No| D[Debug]
    D --> B`,
    sequence: `sequenceDiagram
    participant N as Node.js
    participant W as WASM renderer
    N->>W: renderSvg(source)
    W-->>N: SVG string`,
    class: `classDiagram
    class Renderer {
        +renderSvg(source) string
        +registerFont(bytes) void
    }
    class Plugin
    Plugin --> Renderer`,
    pie: `pie title Renderer time budget
    "Parse" : 20
    "Layout" : 55
    "Render" : 25`,
};

// 1. Render without any registered font (fallback metrics).
const noFont = renderSvg(diagrams.flowchart);
console.log(`no-font flowchart: ${noFont.length} bytes`);

// 2. Register a real font read by the host, then render everything.
const fontPath = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
registerFont(readFileSync(fontPath));
console.log(`registered font: ${fontPath}`);

for (const [name, source] of Object.entries(diagrams)) {
    const t0 = performance.now();
    const svg = renderSvg(source);
    const ms = (performance.now() - t0).toFixed(2);
    if (!svg.startsWith('<svg') && !svg.includes('<svg')) {
        throw new Error(`${name}: output does not look like SVG`);
    }
    writeFileSync(path.join(outDir, `${name}.svg`), svg);
    console.log(`${name}: ${svg.length} bytes in ${ms} ms`);
}

// 3. Config + theme preset path.
const dark = renderSvgWithConfig(
    diagrams.flowchart,
    JSON.stringify({ themeVariables: { fontSize: 14 }, flowchart: { nodeSpacing: 60 } }),
    'dark',
);
writeFileSync(path.join(outDir, 'flowchart-dark.svg'), dark);
console.log(`dark themed flowchart: ${dark.length} bytes`);

// 4. Error handling: invalid input must reject, not abort.
try {
    renderSvg('not a mermaid diagram at all %%%');
    console.log('invalid input: rendered (renderer is lenient)');
} catch (err) {
    console.log(`invalid input: threw as expected: ${String(err).slice(0, 80)}`);
}

console.log('OK');
