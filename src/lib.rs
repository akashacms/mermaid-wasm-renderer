//! WASM bindings for [mermaid-rs-renderer].
//!
//! Exposes Mermaid-to-SVG rendering to JavaScript. Because
//! `wasm32-unknown-unknown` has no filesystem, fonts must be supplied by
//! the host as bytes via [`register_font`]; without registered fonts,
//! layout uses calibrated fallback text metrics.
//!
//! [mermaid-rs-renderer]: https://github.com/1jehuang/mermaid-rs-renderer

use mermaid_rs_renderer::RenderOptions;
use wasm_bindgen::prelude::*;

fn to_js_error(err: anyhow::Error) -> JsError {
    JsError::new(&format!("{err:#}"))
}

/// Render Mermaid source to an SVG string using the default (modern) theme.
#[wasm_bindgen(js_name = renderSvg)]
pub fn render_svg(source: &str) -> Result<String, JsError> {
    mermaid_rs_renderer::render(source).map_err(to_js_error)
}

/// Render Mermaid source to an SVG string with configuration.
///
/// `config_json` uses the same JSON schema as the `mmdr --config` file
/// (`theme`, `themeVariables`, `flowchart`, ...). Pass `undefined`/`null`
/// for defaults. `theme_preset` optionally names a built-in theme
/// (`default`, `dark`, `forest`, `neutral`, `modern`) and takes precedence
/// over the config's `theme` name.
#[wasm_bindgen(js_name = renderSvgWithConfig)]
pub fn render_svg_with_config(
    source: &str,
    config_json: Option<String>,
    theme_preset: Option<String>,
) -> Result<String, JsError> {
    let config = mermaid_rs_renderer::config::config_from_str(
        config_json.as_deref().unwrap_or("{}"),
        theme_preset.as_deref(),
    )
    .map_err(to_js_error)?;
    let options = RenderOptions {
        theme: config.theme,
        layout: config.layout,
    };
    mermaid_rs_renderer::render_with_options(source, options).map_err(to_js_error)
}

/// Register a font (TTF/OTF bytes) for text measurement.
///
/// The first registered font becomes the fallback for generic CSS families
/// (`sans-serif`, `monospace`, ...). Register fonts before rendering;
/// text measurements are cached per font family.
#[wasm_bindgen(js_name = registerFont)]
pub fn register_font(data: &[u8]) {
    mermaid_rs_renderer::register_font_data(data.to_vec());
}
