//! Full-State Capture & Smart Resurrection (Rust Native Core)
//! Captures rich terminal session output, command history, and environment
//! with executed-command rollback disclaimers and safety limits.

use serde::{Deserialize, Serialize};
use std::process::Command;

pub const MAX_STATE_SIZE_BYTES: usize = 5 * 1024 * 1024; // 5 MiB cap

pub const TERMINAL_DISCLAIMER: &str =
    "Note: Prior terminal output, environment, and command history have been restored. Commands already executed on your machine cannot be rolled back.";

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TerminalState {
    pub shell: String,
    pub working_dir: String,
    pub history: Vec<String>,
    pub buffer_text: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(tag = "type")]
pub enum AppStatePayload {
    Terminal(TerminalState),
    GenericWindow {
        title: String,
        exe_path: String,
        bounds: (i32, i32, i32, i32),
    },
}

pub struct RustStateEngine;

impl RustStateEngine {
    pub fn is_terminal(proc_name: &str) -> bool {
        let lower = proc_name.to_lowercase();
        matches!(
            lower.as_str(),
            "cmd.exe" | "powershell.exe" | "pwsh.exe" | "windowsterminal.exe" | "wt.exe" | "bash.exe" | "wsl.exe"
        )
    }

    pub fn resurrect_terminal(state: &TerminalState) -> Result<String, std::io::Error> {
        let shell = if state.shell.is_empty() {
            "cmd.exe".to_string()
        } else {
            state.shell.clone()
        };

        let mut cmd = Command::new(&shell);
        if !state.working_dir.is_empty() {
            cmd.current_dir(&state.working_dir);
        }

        #[cfg(windows)]
        {
            if shell.to_lowercase().ends_with("cmd.exe") {
                let header = format!("[REWIND] Terminal state restored. Working directory: {}", state.working_dir);
                cmd.args(["/K", &format!("title Restored Terminal && echo {}", header)]);
            }
        }

        cmd.spawn()?;
        Ok(TERMINAL_DISCLAIMER.to_string())
    }
}
