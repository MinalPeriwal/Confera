import type { ImageSegmenter } from '@mediapipe/tasks-vision';

/**
 * Background blur, entirely in the browser: a small selfie-segmentation model (MediaPipe) separates the
 * person from the background, the background is blurred on a canvas, and the canvas is published as the
 * camera track. Nothing is uploaded; the runtime and model are served from our own /public folder.
 */

const WASM_PATH = '/mediapipe/wasm';
const MODEL_PATH = '/mediapipe/selfie_segmenter.tflite';
const MAX_WIDTH = 960; // keep per-frame work bounded on laptops and phones

let segmenterPromise: Promise<ImageSegmenter> | null = null;

async function getSegmenter(): Promise<ImageSegmenter> {
  segmenterPromise ??= (async () => {
    const { FilesetResolver, ImageSegmenter } = await import('@mediapipe/tasks-vision');
    const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
    const create = (delegate: 'GPU' | 'CPU') => ImageSegmenter.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_PATH, delegate },
      runningMode: 'VIDEO',
      outputCategoryMask: false,
      outputConfidenceMasks: true,
    });
    try { return await create('GPU'); } catch { return await create('CPU'); }
  })().catch((err) => { segmenterPromise = null; throw err; }); // allow a retry after a failure
  return segmenterPromise;
}

export interface BlurPipeline {
  /** The blurred camera, to send instead of the raw track */
  track: MediaStreamTrack;
  stop: () => void;
}

export async function startBackgroundBlur(cameraTrack: MediaStreamTrack, blurPx = 12): Promise<BlurPipeline> {
  const segmenter = await getSegmenter();

  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = new MediaStream([cameraTrack]);
  await video.play();
  if (!video.videoWidth) await new Promise<void>(resolve => video.addEventListener('loadeddata', () => resolve(), { once: true }));

  const scale = Math.min(1, MAX_WIDTH / video.videoWidth);
  const width = Math.round(video.videoWidth * scale);
  const height = Math.round(video.videoHeight * scale);

  const out = document.createElement('canvas');
  out.width = width; out.height = height;
  const outCtx = out.getContext('2d')!;
  const person = document.createElement('canvas');
  person.width = width; person.height = height;
  const personCtx = person.getContext('2d', { willReadFrequently: true })!;

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastVideoTime = -1;

  const frame = () => {
    if (stopped) return;
    if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      try {
        // 1. blurred background
        outCtx.filter = `blur(${blurPx}px)`;
        outCtx.drawImage(video, 0, 0, width, height);
        outCtx.filter = 'none';

        // 2. person cut-out: camera frame whose alpha comes from the segmentation mask
        const result = segmenter.segmentForVideo(video, performance.now());
        const mask = result.confidenceMasks?.[0];
        if (mask) {
          const alpha = mask.getAsFloat32Array();
          const mw = mask.width, mh = mask.height;
          personCtx.drawImage(video, 0, 0, width, height);
          const img = personCtx.getImageData(0, 0, width, height);
          const px = img.data;
          for (let y = 0; y < height; y++) {
            const my = Math.min(mh - 1, Math.floor((y / height) * mh)) * mw;
            for (let x = 0; x < width; x++) {
              const a = alpha[my + Math.min(mw - 1, Math.floor((x / width) * mw))];
              // soften the edge a little: ramp 0.35..0.65 instead of a hard threshold
              px[(y * width + x) * 4 + 3] = a <= 0.35 ? 0 : a >= 0.65 ? 255 : ((a - 0.35) / 0.3) * 255;
            }
          }
          personCtx.putImageData(img, 0, 0);
          outCtx.drawImage(person, 0, 0);
          mask.close();
        }
        result.close?.();
      } catch {
        // A single bad frame must not kill the pipeline
      }
    }
    timer = setTimeout(frame, 1000 / 30);
  };
  frame();

  const track = out.captureStream(30).getVideoTracks()[0];
  return {
    track,
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      track.stop();
      video.pause();
      video.srcObject = null;
    },
  };
}
