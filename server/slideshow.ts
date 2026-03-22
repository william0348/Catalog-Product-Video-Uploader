/**
 * slideshow.ts
 * 
 * FFmpeg-based slideshow video generator.
 * Converts a sequence of product images into a slideshow video
 * with configurable transitions, text overlays, and aspect ratios.
 */
import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

export interface SlideshowOptions {
  images: { url: string; label?: string }[];
  aspectRatio: "4:5" | "9:16";
  durationPerImage: number; // seconds per image
  transition: "fade" | "slideleft" | "slideright" | "slideup" | "slidedown" | "wipeleft" | "wiperight" | "none";
  transitionDuration: number; // seconds for transition
  overlayText?: string; // fixed text overlay on all frames
  showProductName: boolean; // show per-image label
  textPosition: "top" | "center" | "bottom";
  fontSize?: number;
  backgroundColor?: string; // hex color for padding, default white
}

interface Resolution {
  width: number;
  height: number;
}

function getResolution(aspectRatio: "4:5" | "9:16"): Resolution {
  if (aspectRatio === "9:16") return { width: 1080, height: 1920 };
  return { width: 1080, height: 1350 }; // 4:5
}

async function downloadImage(url: string, destPath: string): Promise<void> {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`Failed to download image: ${url} (${response.status})`);
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destPath, buffer);
}

function runFFmpeg(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("ffmpeg", ["-y", ...args], { maxBuffer: 100 * 1024 * 1024, timeout: 300000 }, (error, stdout, stderr) => {
      if (error) {
        console.error(`[Slideshow] FFmpeg stderr:`, stderr);
        reject(new Error(`FFmpeg failed: ${error.message}\n${stderr}`));
      } else {
        resolve(stderr);
      }
    });
  });
}

const FONT_PATH = "/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf";

/**
 * Generate a slideshow video from a list of images.
 * Returns a Buffer containing the MP4 video data.
 */
export async function generateSlideshow(options: SlideshowOptions): Promise<Buffer> {
  const {
    images,
    aspectRatio,
    durationPerImage,
    transition,
    transitionDuration,
    overlayText,
    showProductName,
    textPosition,
    fontSize = 40,
    backgroundColor = "white",
  } = options;

  if (images.length === 0) throw new Error("No images provided");
  if (images.length > 30) throw new Error("Maximum 30 images allowed per slideshow");

  const resolution = getResolution(aspectRatio);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "slideshow-"));
  const outputPath = path.join(tmpDir, "output.mp4");

  try {
    // 1. Download all images
    console.log(`[Slideshow] Downloading ${images.length} images...`);
    const imagePaths: string[] = [];
    for (let i = 0; i < images.length; i++) {
      const imgPath = path.join(tmpDir, `img_${String(i).padStart(3, "0")}.png`);
      await downloadImage(images[i].url, imgPath);
      imagePaths.push(imgPath);
      console.log(`[Slideshow] Downloaded image ${i + 1}/${images.length}`);
    }

    // 2. Pre-process images: resize and pad to target resolution as PNG
    console.log(`[Slideshow] Pre-processing images to ${resolution.width}x${resolution.height}...`);
    const processedPaths: string[] = [];
    for (let i = 0; i < imagePaths.length; i++) {
      const processedPath = path.join(tmpDir, `processed_${String(i).padStart(3, "0")}.png`);
      await runFFmpeg([
        "-i", imagePaths[i],
        "-vf", `scale=${resolution.width}:${resolution.height}:force_original_aspect_ratio=decrease,pad=${resolution.width}:${resolution.height}:(ow-iw)/2:(oh-ih)/2:color=${backgroundColor},format=yuv420p`,
        "-frames:v", "1",
        processedPath,
      ]);
      processedPaths.push(processedPath);
    }

    // 3. Generate video
    if (images.length === 1 || transition === "none") {
      await generateSimpleSlideshow(processedPaths, outputPath, resolution, durationPerImage, images, overlayText, showProductName, textPosition, fontSize);
    } else {
      await generateTransitionSlideshow(processedPaths, outputPath, resolution, durationPerImage, transitionDuration, transition, images, overlayText, showProductName, textPosition, fontSize);
    }

    // 4. Read output
    console.log(`[Slideshow] Video generated: ${outputPath}`);
    const videoBuffer = fs.readFileSync(outputPath);
    return videoBuffer;
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {
      console.warn(`[Slideshow] Cleanup failed: ${tmpDir}`);
    }
  }
}

/**
 * Simple slideshow: no transitions, just concat images with duration.
 */
async function generateSimpleSlideshow(
  imagePaths: string[],
  outputPath: string,
  _resolution: Resolution,
  durationPerImage: number,
  images: { url: string; label?: string }[],
  overlayText: string | undefined,
  showProductName: boolean,
  textPosition: "top" | "center" | "bottom",
  fontSize: number,
): Promise<void> {
  const tmpDir = path.dirname(outputPath);
  const concatFile = path.join(tmpDir, "concat.txt");
  
  const lines = imagePaths.map(p => `file '${p}'\nduration ${durationPerImage}`);
  lines.push(`file '${imagePaths[imagePaths.length - 1]}'`);
  fs.writeFileSync(concatFile, lines.join("\n"));

  const textFilters = buildTextFilters(images, overlayText, showProductName, textPosition, fontSize, durationPerImage, 0);
  
  const args: string[] = [
    "-f", "concat", "-safe", "0", "-i", concatFile,
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-r", "30",
    "-preset", "fast",
    "-crf", "23",
    "-movflags", "+faststart",
  ];

  if (textFilters.length > 0) {
    args.push("-vf", textFilters.join(","));
  }

  args.push(outputPath);
  await runFFmpeg(args);
}

/**
 * Slideshow with xfade transitions between images.
 */
async function generateTransitionSlideshow(
  imagePaths: string[],
  outputPath: string,
  _resolution: Resolution,
  durationPerImage: number,
  transitionDuration: number,
  transition: string,
  images: { url: string; label?: string }[],
  overlayText: string | undefined,
  showProductName: boolean,
  textPosition: "top" | "center" | "bottom",
  fontSize: number,
): Promise<void> {
  const n = imagePaths.length;
  const clampedTransDur = Math.min(transitionDuration, durationPerImage * 0.4);

  // Build input arguments
  const inputArgs: string[] = [];
  for (const imgPath of imagePaths) {
    inputArgs.push("-loop", "1", "-t", String(durationPerImage), "-i", imgPath);
  }

  // Build xfade filter chain
  const filterParts: string[] = [];
  let prevLabel = "[0:v]";

  for (let i = 1; i < n; i++) {
    const offset = i * durationPerImage - i * clampedTransDur;
    const outLabel = `[v${i}]`;
    filterParts.push(`${prevLabel}[${i}:v]xfade=transition=${transition}:duration=${clampedTransDur}:offset=${offset}${outLabel}`);
    prevLabel = outLabel;
  }

  // Add text overlays
  const textFilters = buildTextFilters(images, overlayText, showProductName, textPosition, fontSize, durationPerImage, clampedTransDur);
  
  let finalLabel = prevLabel;
  if (textFilters.length > 0) {
    filterParts.push(`${prevLabel}${textFilters.join(",")}[final]`);
    finalLabel = "[final]";
  }

  const filterComplex = filterParts.join(";");

  const args: string[] = [
    ...inputArgs,
    "-filter_complex", filterComplex,
    "-map", finalLabel,
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-r", "30",
    "-preset", "fast",
    "-crf", "23",
    "-movflags", "+faststart",
    outputPath,
  ];

  console.log(`[Slideshow] Running FFmpeg with ${transition} transitions (${n} images)...`);
  await runFFmpeg(args);
}

/**
 * Build FFmpeg drawtext filters for text overlays.
 */
function buildTextFilters(
  images: { url: string; label?: string }[],
  overlayText: string | undefined,
  showProductName: boolean,
  textPosition: "top" | "center" | "bottom",
  fontSize: number,
  durationPerImage: number,
  transitionDuration: number,
): string[] {
  const filters: string[] = [];

  // Fixed overlay text (shown on all frames)
  if (overlayText && overlayText.trim()) {
    const escaped = escapeDrawtext(overlayText);
    const yPos = textPosition === "top" ? "h*0.05" : textPosition === "bottom" ? "h-text_h-h*0.05" : "(h-text_h)/2";
    filters.push(
      `drawtext=text='${escaped}':fontfile='${FONT_PATH}':fontsize=${fontSize}:fontcolor=white:borderw=3:bordercolor=black@0.6:x=(w-text_w)/2:y=${yPos}`
    );
  }

  // Per-image product name (timed with enable)
  if (showProductName) {
    for (let i = 0; i < images.length; i++) {
      const label = images[i].label;
      if (!label) continue;
      const escaped = escapeDrawtext(label);
      const startTime = i * (durationPerImage - transitionDuration);
      const endTime = startTime + durationPerImage;
      const yPos = textPosition === "top" ? "h*0.12" : textPosition === "bottom" ? "h-text_h-h*0.12" : "(h-text_h)/2+60";
      filters.push(
        `drawtext=text='${escaped}':fontfile='${FONT_PATH}':fontsize=${Math.round(fontSize * 0.75)}:fontcolor=white:borderw=2:bordercolor=black@0.5:x=(w-text_w)/2:y=${yPos}:enable='between(t\\,${startTime}\\,${endTime})'`
      );
    }
  }

  return filters;
}

/**
 * Escape special characters for FFmpeg drawtext filter.
 */
function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "'\\\\\\''")
    .replace(/:/g, "\\:")
    .replace(/%/g, "%%");
}

// ==================== Facebook Catalog API ====================

export interface CatalogProduct {
  id: string;
  retailerId: string;
  name: string;
  imageUrl: string;
  additionalImages: string[];
}

/**
 * Fetch product images from a Facebook Catalog.
 */
export async function fetchCatalogProducts(
  catalogId: string,
  accessToken: string,
  limit: number = 50,
): Promise<CatalogProduct[]> {
  const fields = "id,name,retailer_id,image_url,additional_image_urls";
  let url = `https://graph.facebook.com/v21.0/${catalogId}/products?fields=${fields}&limit=${Math.min(limit, 250)}&access_token=${accessToken}`;
  
  const products: CatalogProduct[] = [];
  let pageCount = 0;
  const maxPages = Math.ceil(limit / 250);

  while (url && pageCount < maxPages) {
    const response = await fetch(url);
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(`Facebook API error: ${data?.error?.message || "Unknown error"}`);
    }

    for (const item of data.data || []) {
      if (products.length >= limit) break;
      
      const additionalImages: string[] = [];
      if (item.additional_image_urls && Array.isArray(item.additional_image_urls)) {
        additionalImages.push(...item.additional_image_urls);
      }

      products.push({
        id: item.id,
        retailerId: item.retailer_id || "",
        name: item.name || "",
        imageUrl: item.image_url || "",
        additionalImages,
      });
    }

    url = products.length < limit ? (data.paging?.next || "") : "";
    pageCount++;
  }

  return products;
}
