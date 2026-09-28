//! Multi-Tier Universal Undo Engine (Rust Native)
//! Synthesizes Ctrl+Z into target applications and resurrects closed windows.

#[cfg(windows)]
use windows::Win32::UI::Input::KeyboardAndMouse::*;
#[cfg(windows)]
use windows::Win32::UI::WindowsAndMessaging::*;
#[cfg(windows)]
use windows::Win32::Foundation::HWND;

pub struct RustUndoEngine;

impl RustUndoEngine {
    #[cfg(windows)]
    pub fn dispatch_ctrl_z(target_hwnd: HWND) -> bool {
        unsafe {
            if target_hwnd.0 != 0 {
                let _ = SetForegroundWindow(target_hwnd);
            }

            keybd_event(VK_CONTROL.0 as u8, 0, KEYBD_EVENT_FLAGS(0), 0);
            keybd_event(b'Z', 0, KEYBD_EVENT_FLAGS(0), 0);
            keybd_event(b'Z', 0, KEYEVENTF_KEYUP, 0);
            keybd_event(VK_CONTROL.0 as u8, 0, KEYEVENTF_KEYUP, 0);
            true
        }
    }

    pub fn resurrect_process(exe_path: &str) -> Result<(), std::io::Error> {
        std::process::Command::new(exe_path).spawn()?;
        Ok(())
    }
}
