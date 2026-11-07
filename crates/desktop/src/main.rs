#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(feature = "tauri")]
fn main() {
    jey_desktop::shell::run();
}

#[cfg(not(feature = "tauri"))]
fn main() {
    eprintln!("jey-desktop GUI is feature-gated; build with --features tauri");
    std::process::exit(1);
}
