"use client";

import { useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import type { LivenessData } from "./useLivenessData";
import type { TypingMetrics } from "./useTypingMetrics";

// ── Types ──────────────────────────────────────────────────────────────────────
export interface MetricsPacket {
  timestamp: number;
  face: LivenessData["face"];
  headPose: LivenessData["headPose"];
  gaze: LivenessData["gaze"];
  faceCenter: LivenessData["faceCenter"];
  blink: boolean;
  tabActive: boolean;
  typing: TypingMetrics;
}

const TARGET_FPS = 12; // 10-15 FPS range
const INTERVAL_MS = Math.round(1000 / TARGET_FPS);

// ── Hook ───────────────────────────────────────────────────────────────────────
export function useMetricsSender(
  livenessData: LivenessData,
  typingMetrics: TypingMetrics,
  signalingUrl: string | undefined = undefined
) {
  const socketRef = useRef<Socket | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tabActiveRef = useRef(true);

  // Latest data refs (avoid stale closures inside setInterval)
  const livenessRef = useRef(livenessData);
  livenessRef.current = livenessData;
  const typingRef = useRef(typingMetrics);
  typingRef.current = typingMetrics;

  // ── Tab visibility (with hysteresis to prevent shivering) ───────────────────
  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout> | null = null;

    const handleVisibility = () => {
      const state = document.visibilityState;
      
      if (state === "visible") {
        // Switch back to active instantly
        if (hideTimer) {
          clearTimeout(hideTimer);
          hideTimer = null;
        }
        tabActiveRef.current = true;
      } else {
        // Only mark as hidden if it stays hidden for > 500ms
        if (!hideTimer) {
          hideTimer = setTimeout(() => {
            tabActiveRef.current = false;
            hideTimer = null;
          }, 500);
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, []);

  // ── Socket connection + sending loop ───────────────────────────────────────
  useEffect(() => {
    const socket = io(signalingUrl, {
      transports: ["websocket"],
      reconnectionAttempts: 10,
    });
    socketRef.current = socket;

    // Use a Web Worker for reliable background timing
    const worker = new Worker("/workers/timerWorker.js");

    socket.on("connect", () => {
      socket.emit("join", { role: "client-metrics" });
      worker.postMessage({ action: "start", interval: INTERVAL_MS });
    });

    worker.onmessage = () => {
      if (!socketRef.current?.connected) return;

      const packet: MetricsPacket = {
        timestamp: Date.now(),
        face: livenessRef.current.face,
        headPose: livenessRef.current.headPose,
        gaze: livenessRef.current.gaze,
        faceCenter: livenessRef.current.faceCenter,
        blink: livenessRef.current.blink,
        tabActive: tabActiveRef.current,
        typing: typingRef.current,
      };

      socketRef.current.emit("metrics", packet);
    };

    return () => {
      worker.postMessage({ action: "stop" });
      worker.terminate();
      socket.disconnect();
    };
  }, [signalingUrl]);
}
