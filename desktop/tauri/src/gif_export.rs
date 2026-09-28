//! 5-Second GIF Moment Exporter (Rust Native Core)
//! Encodes historical screen frames into animated GIF89a format.

pub struct RustGifExporter;

impl RustGifExporter {
    /// Builds a minimal valid GIF89a header with global color table and repeat loop extension.
    pub fn build_gif_header(width: u16, height: u16) -> Vec<u8> {
        let mut bytes = Vec::with_capacity(1024);

        // Header
        bytes.extend_from_slice(b"GIF89a");
        bytes.extend_from_slice(&width.to_le_bytes());
        bytes.extend_from_slice(&height.to_le_bytes());
        bytes.push(0xf7); // Global Color Table Present (256 colors)
        bytes.push(0x00); // Background Color Index
        bytes.push(0x00); // Pixel Aspect Ratio

        // Global Color Table (grayscale 256 colors)
        for i in 0..=255u8 {
            bytes.push(i);
            bytes.push(i);
            bytes.push(i);
        }

        // Netscape 2.0 Loop Extension
        bytes.extend_from_slice(&[
            0x21, 0xff, 0x0b,
            b'N', b'E', b'T', b'S', b'C', b'A', b'P', b'E', b'2', b'.', b'0',
            0x03, 0x01, 0x00, 0x00,
            0x00,
        ]);

        bytes
    }

    /// Appends the standard GIF trailer byte (0x3B).
    pub fn append_trailer(bytes: &mut Vec<u8>) {
        bytes.push(0x3b);
    }
}
