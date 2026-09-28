// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod security;
mod win_hook;
mod backup_engine;
mod undo_engine;
mod full_state;
mod audio;
mod gif_export;

use security::SecurityFilter;
use backup_engine::RustBackupEngine;
use full_state::{RustStateEngine, TerminalState};
use audio::RustAudioEngine;

#[tauri::command]
fn trigger_undo() -> bool {
    #[cfg(windows)]
    {
        use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;
        let hwnd = unsafe { GetForegroundWindow() };
        undo_engine::RustUndoEngine::dispatch_ctrl_z(hwnd)
    }
    #[cfg(not(windows))]
    {
        false
    }
}

#[tauri::command]
fn play_tick_sound() -> bool {
    RustAudioEngine::play_tick()
}

#[tauri::command]
fn play_resurrect_sound() -> bool {
    RustAudioEngine::play_resurrect()
}

#[tauri::command]
fn toggle_sound(enabled: bool) {
    RustAudioEngine::set_sound_enabled(enabled);
}

#[tauri::command]
fn resurrect_terminal_session(state: TerminalState) -> Result<String, String> {
    RustStateEngine::resurrect_terminal(&state).map_err(|e| e.to_string())
}

fn main() {
    let _security_filter = SecurityFilter::new();
    println!("[REWIND Native] Initialized security filter: 1Password/Bitwarden denylisted.");
    println!("[REWIND Native] Registered hotkey: Ctrl+Alt+Z.");

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            trigger_undo,
            play_tick_sound,
            play_resurrect_sound,
            toggle_sound,
            resurrect_terminal_session
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
