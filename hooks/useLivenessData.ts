"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────
export interface LivenessData {
  face: { detected: boolean; confidence: number };
  headPose: { yaw: number; pitch: number; roll: number };
  gaze: { x: number; y: number };
  faceCenter: { x: number; y: number };
  blink: boolean;
}

const SMOOTHING_WINDOW = 5;

// ── Helpers ────────────────────────────────────────────────────────────────────
function movingAverage(buffer: number[], value: number): number {
  buffer.push(value);
  if (buffer.length > SMOOTHING_WINDOW) buffer.shift();
  return buffer.reduce((a, b) => a + b, 0) / buffer.length;
}

function distance(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number }
): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
}

function dist2D(
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

// Eye Aspect Ratio – used for blink detection
function computeEAR(
  landmarks: { x: number; y: number; z: number }[],
  indices: number[]
): number {
  // Indices: [outer, top1, top2, inner, bottom1, bottom2]
  const outer = landmarks[indices[0]];
  const top1 = landmarks[indices[1]];
  const top2 = landmarks[indices[2]];
  const inner = landmarks[indices[3]];
  const bottom1 = landmarks[indices[4]];
  const bottom2 = landmarks[indices[5]];

  const vertical1 = dist2D(top1, bottom1);
  const vertical2 = dist2D(top2, bottom2);
  const horizontal = dist2D(outer, inner);

  if (horizontal === 0) return 1; // avoid divide-by-zero
  return (vertical1 + vertical2) / (2 * horizontal);
}

// ── Head-pose estimation from 6 key landmarks ─────────────────────────────────
function estimateHeadPose(landmarks: { x: number; y: number; z: number }[]): {
  yaw: number;
  pitch: number;
  roll: number;
} {
  // Key landmark indices (MediaPipe Face Mesh 468 model)
  const noseTip = landmarks[1];
  const chin = landmarks[152];
  const topHead = landmarks[10]; // Top of the face/forehead
  const leftEyeOuter = landmarks[33];
  const rightEyeOuter = landmarks[263];

  // Yaw: horizontal projection of nose relative to eyes
  // rightEyeOuter has smaller X (unmirrored feed), leftEyeOuter has larger X
  const noseYawRatio = getProjectedRatio(noseTip, rightEyeOuter, leftEyeOuter);
  // Neutral is ~0.5. Ratio > 0.5 means looking user's left.
  const yaw = (0.5 - noseYawRatio) * 180;

  // Pitch: vertical projection of nose relative to face height
  const nosePitchRatio = getProjectedRatio(noseTip, topHead, chin);
  // Neutral is usually around 0.5. Ratio < 0.5 means looking up.
  const pitch = (nosePitchRatio - 0.5) * 180;

  // Roll: angle between eye corners
  // dx should be positive when neutral: leftEyeOuter (larger X) - rightEyeOuter (smaller X)
  const dx = leftEyeOuter.x - rightEyeOuter.x;
  const dy = leftEyeOuter.y - rightEyeOuter.y;
  const roll = Math.atan2(dy, dx) * (180 / Math.PI);

  return {
    yaw: Math.round(yaw * 10) / 10,
    pitch: Math.round(pitch * 10) / 10,
    roll: Math.round(roll * 10) / 10,
  };
}

// Helper to project a point onto an axis to decouple X and Y movements
function getProjectedRatio(
  p: { x: number; y: number },
  p0: { x: number; y: number },
  p1: { x: number; y: number }
): number {
  const vX = p1.x - p0.x;
  const vY = p1.y - p0.y;
  const lenSq = vX * vX + vY * vY;
  if (lenSq < 0.000001) return 0.5;
  const wX = p.x - p0.x;
  const wY = p.y - p0.y;
  return (wX * vX + wY * vY) / lenSq;
}

// ── Gaze estimation from iris landmarks ────────────────────────────────────────
function estimateGaze(landmarks: { x: number; y: number; z: number }[]): {
  x: number;
  y: number;
} {
  // Left iris center: 468, Right iris center: 473
  // Left eye corners: 33 (outer), 133 (inner)
  // Right eye corners: 263 (outer), 362 (inner)
  const leftIris = landmarks[468] || landmarks[159]; // fallback
  const rightIris = landmarks[473] || landmarks[386];
  const leftOuter = landmarks[33];
  const leftInner = landmarks[133];
  const rightOuter = landmarks[263];
  const rightInner = landmarks[362];

  // Project iris onto the horizontal axis of each eye
  const leftRatio = getProjectedRatio(leftIris, leftOuter, leftInner);
  const rightRatio = getProjectedRatio(rightIris, rightInner, rightOuter);
  
  // Normalize X to -1 (left) to 1 (right)
  const gazeX = ((leftRatio + rightRatio) / 2 - 0.5) * 2;

  // Vertical axes
  const leftTop = landmarks[159];
  const leftBottom = landmarks[145];
  const rightTop = landmarks[386];
  const rightBottom = landmarks[374];

  // Project iris onto the vertical axis of each eye
  const leftVertRatio = getProjectedRatio(leftIris, leftTop, leftBottom);
  const rightVertRatio = getProjectedRatio(rightIris, rightTop, rightBottom);

  // Normalize Y to -1 (up) to 1 (down)
  const gazeY = ((leftVertRatio + rightVertRatio) / 2 - 0.5) * 2;

  return {
    x: Math.round(gazeX * 100) / 100,
    y: Math.round(gazeY * 100) / 100,
  };
}

// ── Main hook ──────────────────────────────────────────────────────────────────
export function useLivenessData(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const [data, setData] = useState<LivenessData>({
    face: { detected: false, confidence: 0 },
    headPose: { yaw: 0, pitch: 0, roll: 0 },
    gaze: { x: 0, y: 0 },
    faceCenter: { x: 0.5, y: 0.5 },
    blink: false,
  });

  const faceMeshRef = useRef<any>(null);
  const animFrameRef = useRef<number>(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Smoothing buffers
  const yawBuf = useRef<number[]>([]);
  const pitchBuf = useRef<number[]>([]);
  const rollBuf = useRef<number[]>([]);
  const gazeXBuf = useRef<number[]>([]);
  const gazeYBuf = useRef<number[]>([]);

  const EAR_THRESHOLD = 0.21;

  // Left eye indices for EAR: [outer, top1, top2, inner, bottom1, bottom2]
  const LEFT_EYE_IDX = [33, 160, 159, 133, 144, 145];
  const RIGHT_EYE_IDX = [263, 387, 386, 362, 373, 374];

  const processResults = useCallback(
    (results: any) => {
      if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
        setData((prev) => ({
          ...prev,
          face: { detected: false, confidence: 0 },
        }));
        return;
      }

      const landmarks = results.multiFaceLandmarks[0];

      // Face presence & confidence (MediaPipe doesn't expose raw confidence so we use landmark count as proxy)
      const confidence = Math.min(landmarks.length / 468, 1);

      // Head pose
      const rawPose = estimateHeadPose(landmarks);
      const yaw = movingAverage(yawBuf.current, rawPose.yaw);
      const pitch = movingAverage(pitchBuf.current, rawPose.pitch);
      const roll = movingAverage(rollBuf.current, rawPose.roll);

      // Gaze
      const rawGaze = estimateGaze(landmarks);
      const gx = movingAverage(gazeXBuf.current, rawGaze.x);
      const gy = movingAverage(gazeYBuf.current, rawGaze.y);

      // Face center (nose tip normalized 0-1)
      const noseTip = landmarks[1];
      const faceCenter = {
        x: Math.round(noseTip.x * 100) / 100,
        y: Math.round(noseTip.y * 100) / 100,
      };

      // Blink detection via EAR
      const leftEAR = computeEAR(landmarks, LEFT_EYE_IDX);
      const rightEAR = computeEAR(landmarks, RIGHT_EYE_IDX);
      const avgEAR = (leftEAR + rightEAR) / 2;
      const blink = avgEAR < EAR_THRESHOLD;

      setData({
        face: { detected: true, confidence: Math.round(confidence * 100) / 100 },
        headPose: {
          yaw: Math.round(yaw * 10) / 10,
          pitch: Math.round(pitch * 10) / 10,
          roll: Math.round(roll * 10) / 10,
        },
        gaze: {
          x: Math.round(gx * 100) / 100,
          y: Math.round(gy * 100) / 100,
        },
        faceCenter,
        blink,
      });
    },
    []
  );

  useEffect(() => {
    let cancelled = false;

    async function initFaceMesh() {
      // Dynamic import to keep this client-only and avoid SSR issues
      const FaceMeshModule = await import("@mediapipe/face_mesh");
      const FaceMesh = FaceMeshModule.FaceMesh;

      const faceMesh = new FaceMesh({
        locateFile: (file: string) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
      });

      faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true, // enables iris landmarks
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      faceMesh.onResults(processResults);
      faceMeshRef.current = faceMesh;

      // Create an offscreen canvas for frame capture
      if (!canvasRef.current) {
        canvasRef.current = document.createElement("canvas");
      }

      // Start the processing loop
      const processLoop = async () => {
        if (cancelled) return;
        const video = videoRef.current;
        if (video && video.readyState >= 2 && faceMeshRef.current) {
          const canvas = canvasRef.current!;
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(video, 0, 0);
            try {
              await faceMeshRef.current.send({ image: canvas });
            } catch {
              // MediaPipe can occasionally throw when busy
            }
          }
        }
        if (!cancelled) {
          // Fixed 10 FPS rate in the foreground to save CPU/GPU (reduce heat)
          // Fallback to 5 FPS if the tab is backgrounded.
          const delay = document.visibilityState === "hidden" ? 200 : 100;
          setTimeout(processLoop, delay);
        }
      };

      processLoop();
    }

    initFaceMesh();

    return () => {
      cancelled = true;
      cancelAnimationFrame(animFrameRef.current);
      if (faceMeshRef.current) {
        faceMeshRef.current.close();
        faceMeshRef.current = null;
      }
    };
  }, [videoRef, processResults]);

  return data;
}
