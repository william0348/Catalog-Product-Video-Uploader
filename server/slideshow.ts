/**
 * slideshow.ts
 * 
 * FFmpeg-based slideshow video generator.
 * Converts a sequence of product images into a slideshow video
 * with configurable transitions, text overlays, aspect ratios,
 * font customization, and optional background music.
 */
import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

// ==================== Font Configuration ====================

export interface FontConfig {
  id: string;
  name: string;
  path: string;
  supportsCJK: boolean;
}

export const AVAILABLE_FONTS: FontConfig[] = [
  { id: "noto-sans", name: "Noto Sans CJK", path: "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", supportsCJK: true },
  { id: "noto-sans-bold", name: "Noto Sans CJK Bold", path: "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc", supportsCJK: true },
  { id: "noto-sans-medium", name: "Noto Sans CJK Medium", path: "/usr/share/fonts/opentype/noto/NotoSansCJK-Medium.ttc", supportsCJK: true },
  { id: "noto-sans-light", name: "Noto Sans CJK Light", path: "/usr/share/fonts/opentype/noto/NotoSansCJK-Light.ttc", supportsCJK: true },
  { id: "noto-serif", name: "Noto Serif CJK", path: "/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc", supportsCJK: true },
  { id: "noto-serif-bold", name: "Noto Serif CJK Bold", path: "/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc", supportsCJK: true },
  { id: "droid-sans", name: "Droid Sans Fallback", path: "/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf", supportsCJK: true },
  { id: "liberation-sans", name: "Liberation Sans", path: "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf", supportsCJK: false },
  { id: "liberation-sans-bold", name: "Liberation Sans Bold", path: "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf", supportsCJK: false },
  { id: "liberation-serif", name: "Liberation Serif", path: "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf", supportsCJK: false },
  { id: "liberation-mono", name: "Liberation Mono", path: "/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf", supportsCJK: false },
];

const DEFAULT_FONT_PATH = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc";

function getFontPath(fontId?: string): string {
  if (!fontId) return DEFAULT_FONT_PATH;
  const font = AVAILABLE_FONTS.find(f => f.id === fontId);
  return font?.path || DEFAULT_FONT_PATH;
}

// ==================== Types ====================

export interface SlideshowOptions {
  images: { url: string; label?: string }[];
  aspectRatio: "4:5" | "9:16";
  durationPerImage: number;
  transition: "fade" | "slideleft" | "slideright" | "slideup" | "slidedown" | "wipeleft" | "wiperight" | "none";
  transitionDuration: number;
  overlayText?: string;
  showProductName: boolean;
  textPosition: "top" | "center" | "bottom";
  fontSize?: number;
  fontColor?: string; // hex color e.g. "#FFFFFF"
  fontFamily?: string; // font id from AVAILABLE_FONTS
  backgroundColor?: string;
  imageScale?: number; // 0.1 to 2.0, default 1.0 (100%)
  imageOffsetX?: number; // -50 to 50 (percentage of canvas width), default 0
  imageOffsetY?: number; // -50 to 50 (percentage of canvas height), default 0
  audioUrl?: string;
  audioVolume?: number;
}

interface Resolution {
  width: number;
  height: number;
}

function getResolution(aspectRatio: "4:5" | "9:16"): Resolution {
  if (aspectRatio === "9:16") return { width: 1080, height: 1920 };
  return { width: 1080, height: 1350 };
}

// ==================== Helpers ====================

async function downloadFile(url: string, destPath: string): Promise<void> {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`Failed to download file: ${url} (${response.status})`);
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

function calculateVideoDuration(
  imageCount: number,
  durationPerImage: number,
  transition: string,
  transitionDuration: number,
): number {
  if (imageCount <= 1 || transition === "none") {
    return imageCount * durationPerImage;
  }
  const clampedTransDur = Math.min(transitionDuration, durationPerImage * 0.4);
  return imageCount * durationPerImage - (imageCount - 1) * clampedTransDur;
}

/**
 * Convert hex color to FFmpeg-compatible color string.
 * FFmpeg drawtext accepts colors like "white", "#RRGGBB", or "0xRRGGBB".
 */
function toFFmpegColor(hexColor?: string): string {
  if (!hexColor) return "white";
  // Remove # prefix and validate
  const hex = hexColor.replace(/^#/, "");
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return `0x${hex}`;
  }
  return "white";
}

// ==================== Text Filters ====================

interface TextFilterOptions {
  images: { url: string; label?: string }[];
  overlayText?: string;
  showProductName: boolean;
  textPosition: "top" | "center" | "bottom";
  fontSize: number;
  fontColor: string; // FFmpeg color string
  fontPath: string;
  durationPerImage: number;
  transitionDuration: number;
}

function buildTextFilters(opts: TextFilterOptions): string[] {
  const { images, overlayText, showProductName, textPosition, fontSize, fontColor, fontPath, durationPerImage, transitionDuration } = opts;
  const filters: string[] = [];

  // Determine border color based on font color brightness
  const borderColor = "black@0.6";

  // Fixed overlay text (shown on all frames)
  if (overlayText && overlayText.trim()) {
    const escaped = escapeDrawtext(overlayText);
    const yPos = textPosition === "top" ? "h*0.05" : textPosition === "bottom" ? "h-text_h-h*0.05" : "(h-text_h)/2";
    filters.push(
      `drawtext=text='${escaped}':fontfile='${fontPath}':fontsize=${fontSize}:fontcolor=${fontColor}:borderw=3:bordercolor=${borderColor}:x=(w-text_w)/2:y=${yPos}`
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
        `drawtext=text='${escaped}':fontfile='${fontPath}':fontsize=${Math.round(fontSize * 0.75)}:fontcolor=${fontColor}:borderw=2:bordercolor=${borderColor}:x=(w-text_w)/2:y=${yPos}:enable='between(t\\,${startTime}\\,${endTime})'`
      );
    }
  }

  return filters;
}

function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "'\\\\\\''")
    .replace(/:/g, "\\:")
    .replace(/%/g, "%%");
}

// ==================== Video Generation ====================

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
    fontColor,
    fontFamily,
    backgroundColor = "white",
    imageScale = 1.0,
    imageOffsetX = 0,
    imageOffsetY = 0,
    audioUrl,
    audioVolume = 0.5,
  } = options;

  if (images.length === 0) throw new Error("No images provided");
  if (images.length > 50) throw new Error("Maximum 50 images allowed per slideshow");

  const resolution = getResolution(aspectRatio);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "slideshow-"));
  const videoOnlyPath = path.join(tmpDir, "video_only.mp4");
  const outputPath = path.join(tmpDir, "output.mp4");
  const fontPath = getFontPath(fontFamily);
  const ffmpegFontColor = toFFmpegColor(fontColor);

  try {
    // 1. Download all images
    console.log(`[Slideshow] Downloading ${images.length} images...`);
    const imagePaths: string[] = [];
    for (let i = 0; i < images.length; i++) {
      const imgPath = path.join(tmpDir, `img_${String(i).padStart(3, "0")}.png`);
      await downloadFile(images[i].url, imgPath);
      imagePaths.push(imgPath);
      console.log(`[Slideshow] Downloaded image ${i + 1}/${images.length}`);
    }

    // 2. Pre-process images: resize, scale, offset, and pad to target resolution
    console.log(`[Slideshow] Pre-processing images to ${resolution.width}x${resolution.height} (scale=${imageScale}, offsetX=${imageOffsetX}%, offsetY=${imageOffsetY}%)...`);
    const processedPaths: string[] = [];
    const clampedScale = Math.max(0.1, Math.min(2.0, imageScale));
    const scaledW = Math.round(resolution.width * clampedScale);
    const scaledH = Math.round(resolution.height * clampedScale);
    // Offset in pixels (percentage of canvas size)
    const offsetXPx = Math.round((imageOffsetX / 100) * resolution.width);
    const offsetYPx = Math.round((imageOffsetY / 100) * resolution.height);
    // Default center position
    const defaultX = Math.round((resolution.width - scaledW) / 2);
    const defaultY = Math.round((resolution.height - scaledH) / 2);
    const finalX = defaultX + offsetXPx;
    const finalY = defaultY + offsetYPx;

    for (let i = 0; i < imagePaths.length; i++) {
      const processedPath = path.join(tmpDir, `processed_${String(i).padStart(3, "0")}.png`);
      // Step 2a: Create a solid background canvas
      const bgPath = path.join(tmpDir, `bg_${String(i).padStart(3, "0")}.png`);
      await runFFmpeg([
        "-f", "lavfi",
        "-i", `color=c=${backgroundColor}:s=${resolution.width}x${resolution.height}:d=1`,
        "-frames:v", "1",
        bgPath,
      ]);
      // Step 2b: Scale the image to fit within the scaled dimensions
      const scaledImgPath = path.join(tmpDir, `scaled_${String(i).padStart(3, "0")}.png`);
      await runFFmpeg([
        "-i", imagePaths[i],
        "-vf", `scale=${scaledW}:${scaledH}:force_original_aspect_ratio=decrease,pad=${scaledW}:${scaledH}:(ow-iw)/2:(oh-ih)/2:color=0x00000000`,
        "-frames:v", "1",
        scaledImgPath,
      ]);
      // Step 2c: Overlay the scaled image onto the background at the offset position
      await runFFmpeg([
        "-i", bgPath,
        "-i", scaledImgPath,
        "-filter_complex", `[0:v][1:v]overlay=${finalX}:${finalY},format=yuv420p`,
        "-frames:v", "1",
        processedPath,
      ]);
      processedPaths.push(processedPath);
    }

    // 3. Build text filter options
    const textOpts: TextFilterOptions = {
      images, overlayText, showProductName, textPosition, fontSize,
      fontColor: ffmpegFontColor, fontPath, durationPerImage, transitionDuration,
    };

    // 4. Generate video (without audio first)
    const videoTarget = audioUrl ? videoOnlyPath : outputPath;
    if (images.length === 1 || transition === "none") {
      await generateSimpleSlideshow(processedPaths, videoTarget, durationPerImage, textOpts);
    } else {
      await generateTransitionSlideshow(processedPaths, videoTarget, durationPerImage, transitionDuration, transition, textOpts);
    }

    // 5. Add background music if provided
    if (audioUrl) {
      console.log(`[Slideshow] Adding background music...`);
      const audioPath = path.join(tmpDir, "audio_input.mp3");
      await downloadFile(audioUrl, audioPath);

      const videoDuration = calculateVideoDuration(images.length, durationPerImage, transition, transitionDuration);
      const vol = Math.max(0, Math.min(1, audioVolume));

      await runFFmpeg([
        "-i", videoTarget,
        "-stream_loop", "-1", "-i", audioPath,
        "-filter_complex", `[1:a]volume=${vol},afade=t=out:st=${Math.max(0, videoDuration - 2)}:d=2[aout]`,
        "-map", "0:v",
        "-map", "[aout]",
        "-c:v", "copy",
        "-c:a", "aac",
        "-b:a", "192k",
        "-shortest",
        "-movflags", "+faststart",
        outputPath,
      ]);
      console.log(`[Slideshow] Background music added successfully.`);
    }

    // 6. Read output
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

async function generateSimpleSlideshow(
  imagePaths: string[],
  outputPath: string,
  durationPerImage: number,
  textOpts: TextFilterOptions,
): Promise<void> {
  const tmpDir = path.dirname(outputPath);
  const concatFile = path.join(tmpDir, "concat.txt");

  const lines = imagePaths.map(p => `file '${p}'\nduration ${durationPerImage}`);
  lines.push(`file '${imagePaths[imagePaths.length - 1]}'`);
  fs.writeFileSync(concatFile, lines.join("\n"));

  const textFilters = buildTextFilters(textOpts);

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

async function generateTransitionSlideshow(
  imagePaths: string[],
  outputPath: string,
  durationPerImage: number,
  transitionDuration: number,
  transition: string,
  textOpts: TextFilterOptions,
): Promise<void> {
  const n = imagePaths.length;
  const clampedTransDur = Math.min(transitionDuration, durationPerImage * 0.4);

  const inputArgs: string[] = [];
  for (const imgPath of imagePaths) {
    inputArgs.push("-loop", "1", "-t", String(durationPerImage), "-i", imgPath);
  }

  const filterParts: string[] = [];
  let prevLabel = "[0:v]";

  for (let i = 1; i < n; i++) {
    const offset = i * durationPerImage - i * clampedTransDur;
    const outLabel = `[v${i}]`;
    filterParts.push(`${prevLabel}[${i}:v]xfade=transition=${transition}:duration=${clampedTransDur}:offset=${offset}${outLabel}`);
    prevLabel = outLabel;
  }

  const textFilters = buildTextFilters(textOpts);

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

// ==================== Facebook Catalog API ====================

export interface CatalogProduct {
  id: string;
  retailerId: string;
  name: string;
  imageUrl: string;
  additionalImages: string[];
}

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

export async function updateCatalogProductVideo(
  catalogId: string,
  accessToken: string,
  retailerId: string,
  videoUrl: string,
): Promise<{ success: boolean; handle?: string; error?: string }> {
  const batchUrl = `https://graph.facebook.com/v21.0/${catalogId}/items_batch`;
  const batchPayload = {
    access_token: accessToken,
    item_type: "PRODUCT_ITEM",
    requests: [
      {
        method: "UPDATE",
        data: {
          id: retailerId,
          video: [{ url: videoUrl }],
        },
      },
    ],
  };

  console.log(`[Slideshow] Updating catalog ${catalogId} product ${retailerId} with video URL`);

  const response = await fetch(batchUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(batchPayload),
  });

  const result = await response.json();

  if (!response.ok) {
    const errorMsg = result?.error?.message || "Unknown Facebook API error";
    return { success: false, error: errorMsg };
  }

  const handle = result?.handles?.[0];
  return { success: true, handle };
}
