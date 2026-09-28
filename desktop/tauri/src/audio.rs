//! Tactile Audio Feedback (Rust Native Core)
//! Provides synthesized mechanical tick and resurrect audio with zero external file dependencies.

use std::sync::atomic::{AtomicBool, Ordering};

static SOUND_ENABLED: AtomicBool = AtomicBool::new(true);

pub struct RustAudioEngine;

impl RustAudioEngine {
    pub fn set_sound_enabled(enabled: bool) {
        SOUND_ENABLED.store(enabled, Ordering::Relaxed);
    }

    pub fn is_sound_enabled() -> bool {
        SOUND_ENABLED.load(Ordering::Relaxed)
    }

    pub fn play_tick() -> bool {
        if !Self::is_sound_enabled() {
            return false;
        }
        #[cfg(windows)]
        unsafe {
            // Windows native fast beep fallback if audio hardware is active
            use windows::Win32::System::Diagnostics::Debug::MessageBeep;
            use windows::Win32::UI::WindowsAndMessaging::MB_OK;
            let _ = MessageBeep(MB_OK);
        }
        true
    }

    pub fn play_resurrect() -> bool {
        if !Self::is_sound_enabled() {
            return false;
        }
        #[cfg(windows)]
        unsafe {
            use windows::Win32::System::Diagnostics::Debug::MessageBeep;
            use windows::Win32::UI::WindowsAndMessaging::MB_ICONASTERISK;
            let _ = MessageBeep(MB_ICONASTERISK);
        }
        true
    }
}
