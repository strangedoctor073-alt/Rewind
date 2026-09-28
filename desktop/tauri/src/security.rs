//! REWIND Desktop Security & Privacy Filter (Rust Native)
//! Zero-keylogging compliance & sensitive credential shielding.

pub struct SecurityFilter {
    denied_processes: Vec<&'static str>,
    denied_keywords: Vec<&'static str>,
}

impl SecurityFilter {
    pub fn new() -> Self {
        Self {
            denied_processes: vec![
                "1password.exe",
                "bitwarden.exe",
                "keepass.exe",
                "keepassxc.exe",
                "credentialmanager.exe",
                "mstsc.exe",
                "securityhealthsystray.exe",
                "consent.exe",
            ],
            denied_keywords: vec![
                "private browsing",
                "incognito",
                "password",
                "master password",
                "sign in",
                "pin entry",
                "windows security",
            ],
        }
    }

    pub fn is_allowed(&self, process_name: &str, window_title: &str) -> bool {
        let proc = process_name.to_lowercase();
        let title = window_title.to_lowercase();

        if self.denied_processes.iter().any(|&p| proc == p) {
            return false;
        }

        if self.denied_keywords.iter().any(|&kw| title.contains(kw)) {
            return false;
        }

        true
    }
}

impl Default for SecurityFilter {
    fn default() -> Self {
        Self::new()
    }
}
