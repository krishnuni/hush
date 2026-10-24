fn main() {
    // Hush requires an explicit verified local pack; it embeds no upstream web UI
    // or remote model defaults. The upstream config schema expects these names.
    let path = std::path::PathBuf::from(std::env::var("OUT_DIR").unwrap()).join("embedded.rs");
    std::fs::write(path, "pub const CONFIGS: &[(&str, &str)] = &[];\npub const INDEX_HTML: &str = \"\";\n").unwrap();
}
