/* tslint:disable */
/* eslint-disable */

/**
 * Register a font (TTF/OTF bytes) for text measurement.
 *
 * The first registered font becomes the fallback for generic CSS families
 * (`sans-serif`, `monospace`, ...). Register fonts before rendering;
 * text measurements are cached per font family.
 */
export function registerFont(data: Uint8Array): void;

/**
 * Render Mermaid source to an SVG string using the default (modern) theme.
 */
export function renderSvg(source: string): string;

/**
 * Render Mermaid source to an SVG string with configuration.
 *
 * `config_json` uses the same JSON schema as the `mmdr --config` file
 * (`theme`, `themeVariables`, `flowchart`, ...). Pass `undefined`/`null`
 * for defaults. `theme_preset` optionally names a built-in theme
 * (`default`, `dark`, `forest`, `neutral`, `modern`) and takes precedence
 * over the config's `theme` name.
 */
export function renderSvgWithConfig(source: string, config_json?: string | null, theme_preset?: string | null): string;
