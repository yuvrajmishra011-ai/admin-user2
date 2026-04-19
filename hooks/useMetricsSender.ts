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
  signalingUrl: string = typeof window !== "undefined"
    ? process.env.NEXT_PUBLIC_SIGNALING_URL || `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname}:3002`
    : "ws://localhost:3002"
) {
  const socketRef = useRef<Socket | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tabActiveRef = useRef(true);

  // Latest data refs (avoid stale closures inside setInterval)
  const livenessRef = useRef(livenessData);
  livenessRef.current = livenessData;
  const typingRef = useRef(typingMetrics);
  typingRef.current = typingMetrics;

  // ── Tab visibility ─────────────────────────────────────────────────────────
  useEffect(() => {
    const handleVisibility = () => {
      tabActiveRef.current = document.visibilityState === "visible";
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
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
