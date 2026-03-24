/**
 * videoGenerator.ts
 * 
 * Browser-based slideshow video generator using FFmpeg WASM.
 * Generates slideshow videos entirely in the browser without server-side FFmpeg.
 */
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL, fetchFile } from "@ffmpeg/util";

// Singleton FFmpeg instance
let ffmpeg: FFmpeg | null = null;
let ffmpegLoaded = false;
let ffmpegLoading = false;

export interface VideoGeneratorOptions {
  images: { url: string; label?: string }[];
  aspectRatio: "4:5" | "9:16";
  durationPerImage: number;
  transition: "fade" | "slideleft" | "slideright" | "slideup" | "slidedown" | "wipeleft" | "wiperight" | "none";
  transitionDuration: number;
  overlayText?: string;
  textPosition?: "top" | "center" | "bottom";
  fontSize?: number;
  fontColor?: string;
  backgroundColor?: string;
  imageScale?: number;
  imageOffsetX?: number;
  imageOffsetY?: number;
  overlayImageUrl?: string;
  overlayImageScale?: number;
  overlayImageX?: number;
  overlayImageY?: number;
  backgroundVideoUrl?: string;
  introVideoUrl?: string;
  outroVideoUrl?: string;
  audioUrl?: string;
  audioVolume?: number;
  onProgress?: (message: string, percent?: number) => void;
}

interface Resolution {
  width: number;
  height: number;
}

function getResolution(aspectRatio: "4:5" | "9:16"): Resolution {
  if (aspectRatio === "9:16") return { width: 1080, height: 1920 };
  return { width: 1080, height: 1350 };
}

/**
 * Initialize FFmpeg WASM. Downloads the WASM binary on first call.
 */
async function initFFmpeg(onProgress?: (msg: string) => void): Promise<FFmpeg> {
  if (ffmpeg && ffmpegLoaded) return ffmpeg;
  if (ffmpegLoading) {
    // Wait for existing load to complete
    while (ffmpegLoading) {
      await new Promise(r => setTimeout(r, 200));
    }
    if (ffmpeg && ffmpegLoaded) return ffmpeg;
  }

  ffmpegLoading = true;
  try {
    onProgress?.("Loading video engine...");
    ffmpeg = new FFmpeg();
    
    // Use CDN for the WASM binary
    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
    });
    
    ffmpegLoaded = true;
    onProgress?.("Video engine ready");
    return ffmpeg;
  } catch (e) {
    ffmpegLoading = false;
    ffmpeg = null;
    throw new Error(`Failed to load FFmpeg WASM: ${e}`);
  } finally {
    ffmpegLoading = false;
  }
}

/**
 * Download a file and write it to FFmpeg's virtual filesystem
 */
async function writeUrlToFS(ff: FFmpeg, url: string, filename: string): Promise<void> {
  const data = await fetchFile(url);
  await ff.writeFile(filename, data);
}

/**
 * Generate a slideshow video in the browser using FFmpeg WASM.
 * Returns a Blob URL for the generated video.
 */
export async function generateVideoInBrowser(options: VideoGeneratorOptions): Promise<string> {
  const {
    images,
    aspectRatio,
    durationPerImage,
    transition,
    transitionDuration,
    overlayText,
    textPosition = "bottom",
    fontSize = 40,
    fontColor = "#FFFFFF",
    backgroundColor = "#FFFFFF",
    imageScale = 1.0,
    imageOffsetX = 0,
    imageOffsetY = 0,
    backgroundVideoUrl,
    introVideoUrl,
    outroVideoUrl,
    audioUrl,
    audioVolume = 0.5,
    onProgress,
  } = options;

  if (images.length === 0) throw new Error("No images provided");
  if (images.length > 50) throw new Error("Maximum 50 images allowed");

  const resolution = getResolution(aspectRatio);
  const totalSteps = images.length + 3; // download + process + encode + finalize
  let currentStep = 0;

  const reportProgress = (msg: string) => {
    currentStep++;
    const percent = Math.round((currentStep / totalSteps) * 100);
    onProgress?.(msg, percent);
  };

  // 1. Initialize FFmpeg
  const ff = await initFFmpeg((msg) => onProgress?.(msg, 0));

  try {
    // 2. Download all images to FFmpeg FS
    for (let i = 0; i < images.length; i++) {
      const ext = images[i].url.match(/\.(png|jpg|jpeg|webp|gif)/i)?.[1] || "png";
      const filename = `img_${String(i).padStart(3, "0")}.${ext}`;
      reportProgress(`Downloading image ${i + 1}/${images.length}...`);
      await writeUrlToFS(ff, images[i].url, filename);
    }

    // 3. Pre-process each image: resize, scale, offset, pad to target resolution
    reportProgress("Processing images...");
    const clampedScale = Math.max(0.1, Math.min(2.0, imageScale));
    const scaledW = Math.round(resolution.width * clampedScale);
    const scaledH = Math.round(resolution.height * clampedScale);
    const offsetXPx = Math.round((imageOffsetX / 100) * resolution.width);
    const offsetYPx = Math.round((imageOffsetY / 100) * resolution.height);
    const defaultX = Math.round((resolution.width - scaledW) / 2);
    const defaultY = Math.round((resolution.height - scaledH) / 2);
    const finalX = defaultX + offsetXPx;
    const finalY = defaultY + offsetYPx;

    // Hex bg color for FFmpeg
    const bgColor = backgroundColor.startsWith("#") ? `0x${backgroundColor.slice(1)}` : backgroundColor;

    for (let i = 0; i < images.length; i++) {
      const ext = images[i].url.match(/\.(png|jpg|jpeg|webp|gif)/i)?.[1] || "png";
      const inputFile = `img_${String(i).padStart(3, "0")}.${ext}`;
      const processedFile = `processed_${String(i).padStart(3, "0")}.png`;

      // Single FFmpeg command: create background, scale image, overlay
      await ff.exec([
        "-f", "lavfi",
        "-i", `color=c=${bgColor}:s=${resolution.width}x${resolution.height}:d=1`,
        "-i", inputFile,
        "-filter_complex",
        `[1:v]scale=${scaledW}:${scaledH}:force_original_aspect_ratio=decrease,pad=${scaledW}:${scaledH}:(ow-iw)/2:(oh-ih)/2:color=0x00000000[scaled];[0:v][scaled]overlay=${finalX}:${finalY},format=yuv420p`,
        "-frames:v", "1",
        "-y", processedFile,
      ]);
    }

    // 4. Handle background video if provided
    if (backgroundVideoUrl) {
      onProgress?.("Applying background video...", 60);
      await writeUrlToFS(ff, backgroundVideoUrl, "bg_video.mp4");
      
      // Normalize background video
      await ff.exec([
        "-i", "bg_video.mp4",
        "-vf", `scale=${resolution.width}:${resolution.height}:force_original_aspect_ratio=decrease,pad=${resolution.width}:${resolution.height}:(ow-iw)/2:(oh-ih)/2:color=black,fps=30`,
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28",
        "-an",
        "-y", "bg_norm.mp4",
      ]);

      for (let i = 0; i < images.length; i++) {
        const timeOffset = (i * durationPerImage) % 60;
        const bgFrame = `bgframe_${String(i).padStart(3, "0")}.png`;
        const processedFile = `processed_${String(i).padStart(3, "0")}.png`;
        const withBgFile = `withbg_${String(i).padStart(3, "0")}.png`;

        // Extract frame from bg video
        await ff.exec([
          "-ss", String(timeOffset),
          "-i", "bg_norm.mp4",
          "-frames:v", "1",
          "-vf", `scale=${resolution.width}:${resolution.height}`,
          "-y", bgFrame,
        ]);

        // Overlay product image on bg frame
        await ff.exec([
          "-i", bgFrame,
          "-i", processedFile,
          "-filter_complex", `[0:v][1:v]overlay=0:0,format=yuv420p`,
          "-frames:v", "1",
          "-y", withBgFile,
        ]);

        // Rename for consistency
        await ff.exec([
          "-i", withBgFile,
          "-frames:v", "1",
          "-y", processedFile,
        ]);
      }
    }

    // 5. Generate the slideshow video
    reportProgress("Encoding video...");
    
    if (images.length === 1 || transition === "none") {
      // Simple slideshow: concat images with duration
      const concatContent = images.map((_, i) => {
        const f = `processed_${String(i).padStart(3, "0")}.png`;
        return `file '${f}'\nduration ${durationPerImage}`;
      }).join("\n") + `\nfile 'processed_${String(images.length - 1).padStart(3, "0")}.png'`;
      
      // Write concat file
      const encoder = new TextEncoder();
      await ff.writeFile("concat.txt", encoder.encode(concatContent));

      const args: string[] = [
        "-f", "concat", "-safe", "0", "-i", "concat.txt",
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-r", "30",
        "-preset", "ultrafast",
        "-crf", "28",
        "-movflags", "+faststart",
        "-y", "slideshow.mp4",
      ];

      await ff.exec(args);
    } else {
      // Transition slideshow using xfade
      const n = images.length;
      const clampedTransDur = Math.min(transitionDuration, durationPerImage * 0.4);

      const inputArgs: string[] = [];
      for (let i = 0; i < n; i++) {
        inputArgs.push("-loop", "1", "-t", String(durationPerImage), "-i", `processed_${String(i).padStart(3, "0")}.png`);
      }

      const filterParts: string[] = [];
      let prevLabel = "[0:v]";

      for (let i = 1; i < n; i++) {
        const offset = i * durationPerImage - i * clampedTransDur;
        const outLabel = `[v${i}]`;
        filterParts.push(`${prevLabel}[${i}:v]xfade=transition=${transition}:duration=${clampedTransDur}:offset=${offset.toFixed(2)}${outLabel}`);
        prevLabel = outLabel;
      }

      const filterComplex = filterParts.join(";");

      const args: string[] = [
        ...inputArgs,
        "-filter_complex", filterComplex,
        "-map", prevLabel,
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-r", "30",
        "-preset", "ultrafast",
        "-crf", "28",
        "-movflags", "+faststart",
        "-y", "slideshow.mp4",
      ];

      await ff.exec(args);
    }

    // 6. Handle intro/outro concatenation
    let mainVideoFile = "slideshow.mp4";
    
    if (introVideoUrl || outroVideoUrl) {
      onProgress?.("Adding intro/outro...", 80);
      const concatParts: string[] = [];

      if (introVideoUrl) {
        await writeUrlToFS(ff, introVideoUrl, "intro_raw.mp4");
        await ff.exec([
          "-i", "intro_raw.mp4",
          "-vf", `scale=${resolution.width}:${resolution.height}:force_original_aspect_ratio=decrease,pad=${resolution.width}:${resolution.height}:(ow-iw)/2:(oh-ih)/2:color=black,fps=30`,
          "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28",
          "-an",
          "-y", "intro_norm.mp4",
        ]);
        concatParts.push("intro_norm.mp4");
      }

      concatParts.push("slideshow.mp4");

      if (outroVideoUrl) {
        await writeUrlToFS(ff, outroVideoUrl, "outro_raw.mp4");
        await ff.exec([
          "-i", "outro_raw.mp4",
          "-vf", `scale=${resolution.width}:${resolution.height}:force_original_aspect_ratio=decrease,pad=${resolution.width}:${resolution.height}:(ow-iw)/2:(oh-ih)/2:color=black,fps=30`,
          "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28",
          "-an",
          "-y", "outro_norm.mp4",
        ]);
        concatParts.push("outro_norm.mp4");
      }

      const concatContent = concatParts.map(p => `file '${p}'`).join("\n");
      const encoder = new TextEncoder();
      await ff.writeFile("concat_parts.txt", encoder.encode(concatContent));

      await ff.exec([
        "-f", "concat", "-safe", "0", "-i", "concat_parts.txt",
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        "-y", "concat_output.mp4",
      ]);
      mainVideoFile = "concat_output.mp4";
    }

    // 7. Add audio if provided
    let finalVideoFile = mainVideoFile;
    
    if (audioUrl) {
      onProgress?.("Adding background music...", 90);
      await writeUrlToFS(ff, audioUrl, "audio_input.mp3");

      const vol = Math.max(0, Math.min(1, audioVolume));
      const totalDuration = images.length === 1 || transition === "none"
        ? images.length * durationPerImage
        : images.length * durationPerImage - (images.length - 1) * Math.min(transitionDuration, durationPerImage * 0.4);

      await ff.exec([
        "-i", mainVideoFile,
        "-stream_loop", "-1", "-i", "audio_input.mp3",
        "-filter_complex", `[1:a]volume=${vol},afade=t=in:st=0:d=1,afade=t=out:st=${Math.max(0, totalDuration - 2)}:d=2[aout]`,
        "-map", "0:v",
        "-map", "[aout]",
        "-c:v", "copy",
        "-c:a", "aac",
        "-b:a", "192k",
        "-shortest",
        "-movflags", "+faststart",
        "-y", "final_output.mp4",
      ]);
      finalVideoFile = "final_output.mp4";
    }

    // 8. Read the output file and create a Blob URL
    reportProgress("Finalizing video...");
    const outputData = await ff.readFile(finalVideoFile);
    // Cast to handle Uint8Array<ArrayBufferLike> vs ArrayBufferView<ArrayBuffer> mismatch
    const blob = new Blob([new Uint8Array(outputData as Uint8Array)], { type: "video/mp4" });
    const blobUrl = URL.createObjectURL(blob);

    // Clean up FFmpeg FS
    try {
      const files = await ff.listDir("/");
      for (const file of files) {
        if (file.name !== "." && file.name !== "..") {
          try { await ff.deleteFile(file.name); } catch {}
        }
      }
    } catch {}

    return blobUrl;
  } catch (error: any) {
    // Clean up on error
    try {
      const files = await ff.listDir("/");
      for (const file of files) {
        if (file.name !== "." && file.name !== "..") {
          try { await ff.deleteFile(file.name); } catch {}
        }
      }
    } catch {}
    throw error;
  }
}

/**
 * Upload a blob URL video to S3 via the server proxy
 */
export async function uploadVideoToS3(blobUrl: string, trpcMutate: (path: string, input: any) => Promise<any>): Promise<string> {
  const response = await fetch(blobUrl);
  const blob = await response.blob();
  
  // Convert to base64
  const arrayBuffer = await blob.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const chunk = uint8Array.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  const base64 = btoa(binary);

  const result = await trpcMutate("slideshow.uploadVideo", {
    base64Data: base64,
    fileName: `slideshow_${Date.now()}.mp4`,
    mimeType: "video/mp4",
  });

  return result.url;
}

/**
 * Check if FFmpeg WASM is supported in the current browser
 */
export function isFFmpegWASMSupported(): boolean {
  return typeof WebAssembly !== "undefined" && typeof SharedArrayBuffer !== "undefined";
}
