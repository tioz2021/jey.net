//! Decoding, EXIF-aware orientation and WebP renditions.
//!
//! A phone photo is often huge and stored sideways: the pixels are 4000×3000
//! while EXIF says "rotate 90°". Both are fixed here before anything is saved.

use std::io::Cursor;

use image::imageops::FilterType;
use image::metadata::Orientation;
use image::{DynamicImage, ImageDecoder, ImageReader};

use crate::error::AppError;

/// Longest side of the full-size rendition.
pub const LARGE_MAX_SIDE: u32 = 1200;
/// Longest side of the list thumbnail.
pub const PREVIEW_MAX_SIDE: u32 = 400;
/// Lossy WebP quality; 78 keeps photos under the size budget.
const WEBP_QUALITY: f32 = 78.0;
/// Avatars are square and small: they appear in the header and profile.
pub const AVATAR_SIZE: u32 = 128;

/// Original dimensions (after orientation) and the two WebP renditions.
#[derive(Debug)]
pub struct ProcessedImage {
    pub width: u32,
    pub height: u32,
    pub large: Vec<u8>,
    pub large_width: u32,
    pub large_height: u32,
    pub preview: Vec<u8>,
    pub preview_width: u32,
    pub preview_height: u32,
}

/// Decodes the image, applies EXIF orientation and produces both renditions.
pub fn process(bytes: &[u8]) -> Result<ProcessedImage, AppError> {
    let reader = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|_| undecodable())?;

    let mut decoder = reader.into_decoder().map_err(|_| undecodable())?;
    let orientation = decoder.orientation().unwrap_or(Orientation::NoTransforms);

    let mut image = DynamicImage::from_decoder(decoder).map_err(|_| undecodable())?;
    image.apply_orientation(orientation);

    let width = image.width();
    let height = image.height();

    // The preview is derived from the large rendition: one resize pass per
    // step keeps the thumbnail sharp and the work small.
    let large_image = fit_within(&image, LARGE_MAX_SIDE);
    let preview_image = fit_within(&large_image, PREVIEW_MAX_SIDE);

    Ok(ProcessedImage {
        width,
        height,
        large: to_webp(&large_image)?,
        large_width: large_image.width(),
        large_height: large_image.height(),
        preview: to_webp(&preview_image)?,
        preview_width: preview_image.width(),
        preview_height: preview_image.height(),
    })
}

/// Crops the centre square and resizes it to 128 px.
pub fn avatar(bytes: &[u8]) -> Result<Vec<u8>, AppError> {
    let reader = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|_| undecodable())?;

    let mut decoder = reader.into_decoder().map_err(|_| undecodable())?;
    let orientation = decoder.orientation().unwrap_or(Orientation::NoTransforms);

    let mut image = DynamicImage::from_decoder(decoder).map_err(|_| undecodable())?;
    image.apply_orientation(orientation);

    let side = image.width().min(image.height());
    let x = (image.width() - side) / 2;
    let y = (image.height() - side) / 2;

    let square = image.crop_imm(x, y, side, side).resize_exact(
        AVATAR_SIZE,
        AVATAR_SIZE,
        FilterType::Lanczos3,
    );

    to_webp(&square)
}

fn undecodable() -> AppError {
    AppError::unsupported_media_type("image could not be decoded")
}

fn fit_within(image: &DynamicImage, max_side: u32) -> DynamicImage {
    if image.width().max(image.height()) <= max_side {
        return image.clone();
    }

    image.resize(max_side, max_side, FilterType::Lanczos3)
}

fn to_webp(image: &DynamicImage) -> Result<Vec<u8>, AppError> {
    let rgba = image.to_rgba8();
    let encoder = webp::Encoder::new(
        rgba.as_raw(),
        webp::PixelLayout::Rgba,
        image.width(),
        image.height(),
    );

    Ok(encoder.encode(WEBP_QUALITY).to_vec())
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::ImageFormat;

    fn jpeg_of(width: u32, height: u32) -> Vec<u8> {
        let image = DynamicImage::new_rgb8(width, height);
        let mut bytes = Vec::new();
        image
            .write_to(&mut Cursor::new(&mut bytes), ImageFormat::Jpeg)
            .expect("encode jpeg");

        bytes
    }

    #[test]
    fn large_photo_gives_two_webp_renditions() {
        let processed = process(&jpeg_of(4000, 3000)).expect("processes");

        assert_eq!((processed.width, processed.height), (4000, 3000));
        assert_eq!((processed.large_width, processed.large_height), (1200, 900));
        assert_eq!(
            (processed.preview_width, processed.preview_height),
            (400, 300)
        );
        assert!(
            processed.large.len() < 300 * 1024,
            "large rendition is too big: {} bytes",
            processed.large.len()
        );
        assert!(processed.preview.len() <= processed.large.len());
    }

    #[test]
    fn small_photo_is_not_upscaled() {
        let processed = process(&jpeg_of(320, 200)).expect("processes");

        assert_eq!((processed.large_width, processed.large_height), (320, 200));
        assert_eq!(
            (processed.preview_width, processed.preview_height),
            (320, 200)
        );
    }

    #[test]
    fn exif_rotation_is_applied() {
        let rotated = with_exif_orientation(jpeg_of(400, 200), 6);
        let processed = process(&rotated).expect("processes");

        // A sideways photo becomes upright: the sides swap.
        assert_eq!((processed.width, processed.height), (200, 400));
    }

    #[test]
    fn avatar_is_square_even_for_a_wide_photo() {
        let decoded = image::load_from_memory(&avatar(&jpeg_of(400, 200)).expect("avatar"))
            .expect("decode webp");

        assert_eq!(
            (decoded.width(), decoded.height()),
            (AVATAR_SIZE, AVATAR_SIZE)
        );
    }

    #[test]
    fn broken_file_is_rejected() {
        let mut broken = vec![0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];
        broken.extend_from_slice(b"not really a png");

        let error = process(&broken).expect_err("must fail");
        assert!(error.to_string().contains("could not be decoded"));
    }

    /// Inserts an APP1 EXIF segment with the given orientation right after SOI.
    fn with_exif_orientation(jpeg: Vec<u8>, orientation: u16) -> Vec<u8> {
        let mut tiff = Vec::new();
        tiff.extend_from_slice(b"MM\x00\x2A\x00\x00\x00\x08");
        tiff.extend_from_slice(&1u16.to_be_bytes());
        tiff.extend_from_slice(&0x0112u16.to_be_bytes());
        tiff.extend_from_slice(&3u16.to_be_bytes());
        tiff.extend_from_slice(&1u32.to_be_bytes());
        tiff.extend_from_slice(&orientation.to_be_bytes());
        tiff.extend_from_slice(&0u16.to_be_bytes());
        tiff.extend_from_slice(&0u32.to_be_bytes());

        let mut payload = b"Exif\x00\x00".to_vec();
        payload.extend_from_slice(&tiff);

        let mut out = jpeg[0..2].to_vec();
        out.extend_from_slice(&[0xFF, 0xE1]);
        out.extend_from_slice(&((payload.len() + 2) as u16).to_be_bytes());
        out.extend_from_slice(&payload);
        out.extend_from_slice(&jpeg[2..]);

        out
    }
}
