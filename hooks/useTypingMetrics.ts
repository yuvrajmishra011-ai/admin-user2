"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────
export interface TypingMetrics {
  keystrokes: number;
  currentSpeed: number; // keys per second
  lastKeyInterval: number; // ms since prior key
  intervalVariance: number;
  intervalSamples: number[]; // last N intervals in ms
}

const MAX_SAMPLES = 20; // rolling window of intervals
const SPEED_WINDOW_MS = 5000; // compute speed over last 5 s

// ── Hook ───────────────────────────────────────────────────────────────────────
export function useTypingMetrics(): TypingMetrics {
  const [metrics, setMetrics] = useState<TypingMetrics>({
    keystrokes: 0,
    currentSpeed: 0,
    lastKeyInterval: 0,
    intervalVariance: 0,
    intervalSamples: [],
  });

  const keystrokesRef = useRef(0);
  const lastKeyTimeRef = useRef<number | null>(null);
  const intervalsRef = useRef<number[]>([]);
  const recentTimestampsRef = useRef<number[]>([]);

  const handleKeyDown = useCallback(() => {
    const now = performance.now();

    keystrokesRef.current += 1;

    // Interval since last key
    let interval = 0;
    if (lastKeyTimeRef.current !== null) {
      interval = now - lastKeyTimeRef.current;
      intervalsRef.current.push(interval);
      if (intervalsRef.current.length > MAX_SAMPLES) {
        intervalsRef.current.shift();
      }
    }
    lastKeyTimeRef.current = now;

    // Track timestamps for speed calculation
    recentTimestampsRef.current.push(now);
    // Trim timestamps older than SPEED_WINDOW_MS
    const cutoff = now - SPEED_WINDOW_MS;
    recentTimestampsRef.current = recentTimestampsRef.current.filter(
      (t) => t >= cutoff
    );

    // Speed: keys in the window / seconds
    const speed =
      recentTimestampsRef.current.length / (SPEED_WINDOW_MS / 1000);

    // Variance of intervals
    const samples = [...intervalsRef.current];
    let variance = 0;
    if (samples.length >= 2) {
      const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
      variance =
        samples.reduce((sum, v) => sum + (v - mean) ** 2, 0) /
        (samples.length - 1);
    }

    setMetrics({
      keystrokes: keystrokesRef.current,
      currentSpeed: Math.round(speed * 100) / 100,
      lastKeyInterval: Math.round(interval),
      intervalVariance: Math.round(variance * 100) / 100,
      intervalSamples: samples.slice(-10).map(Math.round), // last 10
    });
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return metrics;
}
