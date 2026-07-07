// Smoke test: render several diagram types from Node.js via the WASM build.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { renderSvg, renderSvgWithConfig, registerFont } = require('../pkg/mermaid_wasm_renderer.js');

const testDir = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(testDir, 'output');
mkdirSync(outDir, { recursive: true });

// Assert a rendered string looks like real SVG, not an error page or empty
// output. This is deliberately lightweight: the goal is to catch WASM-only
// runtime failures (panics, mistranslated code paths) that native `cargo
// test` cannot see, not to validate visual fidelity.
function assertLooksLikeSvg(label, svg) {
    if (typeof svg !== 'string' || svg.length === 0) {
        throw new Error(`${label}: renderer returned empty output`);
    }
    if (!svg.includes('<svg') || !svg.includes('</svg>')) {
        throw new Error(`${label}: output does not look like SVG (no <svg>...</svg>)`);
    }
}

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
    assertLooksLikeSvg(name, svg);
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

// 5. Render the upstream fixture corpus through the WASM build.
//
// vendor/ is NOT committed (it is recreated from a clone + patch), so this
// step only runs in a dev checkout that has set it up. Its purpose is to
// exercise every diagram type upstream ships against the WASM build: if the
// WASM translation mishandles a code path that the native Rust version
// handles (e.g. a runtime panic), rendering that fixture throws or returns
// non-SVG, and we fail. We only check that each result is real SVG, not that
// it matches any reference output.
const fixturesDir = path.join(
    testDir,
    '..',
    'vendor',
    'mermaid-rs-renderer',
    'tests',
    'fixtures',
);

if (existsSync(fixturesDir)) {
    const fixtures = [];
    for (const entry of readdirSync(fixturesDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const typeDir = path.join(fixturesDir, entry.name);
        for (const file of readdirSync(typeDir)) {
            if (file.endsWith('.mmd')) {
                fixtures.push(path.join(typeDir, file));
            }
        }
    }
    fixtures.sort();

    let passed = 0;
    const failures = [];
    for (const file of fixtures) {
        const label = path.relative(fixturesDir, file);
        const source = readFileSync(file, 'utf8');
        try {
            const svg = renderSvg(source);
            assertLooksLikeSvg(label, svg);
            passed += 1;
        } catch (err) {
            failures.push(`  ${label}: ${String(err.message ?? err).slice(0, 120)}`);
        }
    }

    console.log(`upstream fixtures: ${passed}/${fixtures.length} rendered as SVG`);
    if (failures.length > 0) {
        throw new Error(`fixture rendering failed:\n${failures.join('\n')}`);
    }
} else {
    console.log('upstream fixtures: skipped (vendor/ not present)');
}

console.log('OK');
