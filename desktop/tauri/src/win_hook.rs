//! Native Windows Event Hook Subsystem
//! Hooks EVENT_SYSTEM_FOREGROUND and EVENT_OBJECT_DESTROY without keylogging.

#[cfg(windows)]
use windows::Win32::UI::WindowsAndMessaging::*;
#[cfg(windows)]
use windows::Win32::UI::Accessibility::*;
#[cfg(windows)]
use windows::Win32::Foundation::HWND;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct WindowSnapshot {
    pub title: String,
    pub process_name: String,
    pub exe_path: String,
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    pub timestamp: i64,
}

#[cfg(windows)]
pub fn install_window_hooks() {
    unsafe {
        let _ = SetWinEventHook(
            EVENT_SYSTEM_FOREGROUND,
            EVENT_OBJECT_DESTROY,
            None,
            Some(win_event_callback),
            0,
            0,
            WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS,
        );
    }
}

#[cfg(windows)]
unsafe extern "system" fn win_event_callback(
    _hook: HWINEVENTHOOK,
    event: u32,
    hwnd: HWND,
    id_object: i32,
    id_child: i32,
    _event_thread: u32,
    _event_time: u32,
) {
    if id_object != OBJID_WINDOW.0 || id_child != 0 || hwnd.0 == 0 {
        return;
    }

    match event {
        EVENT_SYSTEM_FOREGROUND => {
            // Process window switch event
        }
        EVENT_OBJECT_DESTROY => {
            // Record window close event & geometry
        }
        _ => {}
    }
}
