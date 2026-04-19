"use client";

import { useEffect, useRef, useState } from "react";
import { useLivenessData } from "@/hooks/useLivenessData";
import { useTypingMetrics } from "@/hooks/useTypingMetrics";
import { useWebRTC } from "@/hooks/useWebRTC";
import { useMetricsSender } from "@/hooks/useMetricsSender";
import type { MetricsPacket } from "@/hooks/useMetricsSender";
import styles from "./LiveMonitor.module.css";

export default function LiveMonitor() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  // ── Hooks ────────────────────────────────────────────────────────────────────
  const livenessData = useLivenessData(videoRef);
  const typingMetrics = useTypingMetrics();
  const webrtcState = useWebRTC();

  // Metrics sender
  useMetricsSender(livenessData, typingMetrics);

  // ── Attach local stream to video element ─────────────────────────────────────
  useEffect(() => {
    if (webrtcState.localStream && videoRef.current) {
      videoRef.current.srcObject = webrtcState.localStream;
      setCameraReady(true);
    }
    if (webrtcState.error) {
      setPermissionError(webrtcState.error);
    }
  }, [webrtcState.localStream, webrtcState.error]);

  // ── Derived state ────────────────────────────────────────────────────────────
  const faceDetected = livenessData.face.detected;
  const confidence = livenessData.face.confidence;

  // Build the current packet for the debug panel
  const currentPacket: MetricsPacket = {
    timestamp: Date.now(),
    face: livenessData.face,
    headPose: livenessData.headPose,
    gaze: livenessData.gaze,
    faceCenter: livenessData.faceCenter,
    blink: livenessData.blink,
    tabActive: typeof document !== "undefined" ? document.visibilityState === "visible" : true,
    typing: typingMetrics,
  };

  return (
    <div className={styles.container}>
      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className={styles.header}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                stroke="url(#grad)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <defs>
                <linearGradient id="grad" x1="2" y1="2" x2="22" y2="22">
                  <stop stopColor="#6366f1" />
                  <stop offset="1" stopColor="#a855f7" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <span className={styles.logoText}>VeriStream</span>
        </div>
        <div className={styles.headerRight}>
          <div
            className={`${styles.statusPill} ${
              webrtcState.status === "connected"
                ? styles.statusLive
                : webrtcState.status === "connecting"
                ? styles.statusConnecting
                : styles.statusOffline
            }`}
          >
            <span className={styles.statusDot} />
            {webrtcState.status === "connected"
              ? "STREAMING"
              : webrtcState.status === "connecting"
              ? "CONNECTING"
              : "OFFLINE"}
          </div>
        </div>
      </header>

      {/* ── Main content ────────────────────────────────────────────── */}
      <main className={styles.main}>
        {/* ── Video panel ─────────────────────────────────────────── */}
        <div className={styles.videoPanel}>
          <div className={styles.videoContainer}>
            {permissionError && (
              <div className={styles.errorOverlay}>
                <div className={styles.errorIcon}>⚠️</div>
                <p className={styles.errorText}>Camera Access Required</p>
                <p className={styles.errorSub}>{permissionError}</p>
              </div>
            )}
            {!currentPacket.tabActive && (
              <div className={styles.backgroundOverlay}>
                <div className={styles.pulseIcon} />
                <p className={styles.backgroundText}>Background Mode Active</p>
                <p className={styles.backgroundSub}>Still sending telemetry to admin</p>
              </div>
            )}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={styles.video}
            />
            {/* Face detection overlay */}
            <div
              className={`${styles.faceIndicator} ${
                faceDetected ? styles.faceDetected : styles.faceNotDetected
              }`}
            >
              <span className={styles.faceDot} />
              {faceDetected ? "Face Detected" : "No Face Detected"}
            </div>
            {/* Confidence bar */}
            {faceDetected && (
              <div className={styles.confidenceBar}>
                <div
                  className={styles.confidenceFill}
                  style={{ width: `${confidence * 100}%` }}
                />
              </div>
            )}
            {/* Corner scan lines */}
            <div className={`${styles.corner} ${styles.cornerTL}`} />
            <div className={`${styles.corner} ${styles.cornerTR}`} />
            <div className={`${styles.corner} ${styles.cornerBL}`} />
            <div className={`${styles.corner} ${styles.cornerBR}`} />
          </div>
        </div>

        {/* ── Metrics panel ───────────────────────────────────────── */}
        <div className={styles.metricsPanel}>
          <h2 className={styles.metricsTitle}>Live Telemetry</h2>

          {/* Head Pose */}
          <div className={styles.metricCard}>
            <div className={styles.metricHeader}>
              <span className={styles.metricIcon}>🧭</span>
              <span>Head Pose</span>
            </div>
            <div className={styles.metricGrid}>
              <MetricValue label="Yaw" value={livenessData.headPose.yaw} unit="°" />
              <MetricValue label="Pitch" value={livenessData.headPose.pitch} unit="°" />
              <MetricValue label="Roll" value={livenessData.headPose.roll} unit="°" />
            </div>
          </div>

          {/* Gaze */}
          <div className={styles.metricCard}>
            <div className={styles.metricHeader}>
              <span className={styles.metricIcon}>👁️</span>
              <span>Gaze Direction</span>
            </div>
            <div className={styles.metricGrid}>
              <MetricValue label="X" value={livenessData.gaze.x} />
              <MetricValue label="Y" value={livenessData.gaze.y} />
            </div>
            <GazeVisualizer gx={livenessData.gaze.x} gy={livenessData.gaze.y} />
          </div>

          {/* Blink & Tab */}
          <div className={styles.metricCard}>
            <div className={styles.metricHeader}>
              <span className={styles.metricIcon}>👁️</span>
              <span>Blink & Focus</span>
            </div>
            <div className={styles.metricRow}>
              <div className={styles.boolChip}>
                <span
                  className={`${styles.boolDot} ${
                    livenessData.blink ? styles.dotRed : styles.dotGreen
                  }`}
                />
                {livenessData.blink ? "Blinking" : "Eyes Open"}
              </div>
              <div className={styles.boolChip}>
                <span
                  className={`${styles.boolDot} ${
                    currentPacket.tabActive ? styles.dotGreen : styles.dotRed
                  }`}
                />
                {currentPacket.tabActive ? "Tab Active" : "Tab Hidden"}
              </div>
            </div>
          </div>

          {/* Typing */}
          <div className={styles.metricCard}>
            <div className={styles.metricHeader}>
              <span className={styles.metricIcon}>⌨️</span>
              <span>Typing Dynamics</span>
            </div>
            <div className={styles.metricGrid}>
              <MetricValue
                label="Keystrokes"
                value={typingMetrics.keystrokes}
              />
              <MetricValue
                label="Speed"
                value={typingMetrics.currentSpeed}
                unit=" k/s"
              />
              <MetricValue
                label="Interval"
                value={typingMetrics.lastKeyInterval}
                unit="ms"
              />
              <MetricValue
                label="Variance"
                value={Math.round(typingMetrics.intervalVariance)}
                unit=""
              />
            </div>
          </div>

          {/* JSON preview */}
          <div className={styles.metricCard}>
            <div className={styles.metricHeader}>
              <span className={styles.metricIcon}>📦</span>
              <span>Outgoing Packet</span>
            </div>
            <pre className={styles.jsonPreview}>
              {JSON.stringify(currentPacket, null, 2)}
            </pre>
          </div>
        </div>
      </main>

      {/* ── Typing test area ────────────────────────────────────────── */}
      <div className={styles.typingArea}>
        <input
          type="text"
          placeholder="Type here to generate typing metrics…"
          className={styles.typingInput}
        />
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function MetricValue({
  label,
  value,
  unit = "",
}: {
  label: string;
  value: number;
  unit?: string;
}) {
  return (
    <div className={styles.metricValue}>
      <span className={styles.metricLabel}>{label}</span>
      <span className={styles.metricNum}>
        {value}
        <span className={styles.metricUnit}>{unit}</span>
      </span>
    </div>
  );
}

function GazeVisualizer({ gx, gy }: { gx: number; gy: number }) {
  // Map -1..1 to 0..100%
  const x = ((gx + 1) / 2) * 100;
  const y = ((gy + 1) / 2) * 100;
  return (
    <div className={styles.gazeViz}>
      <div className={styles.gazeBg}>
        <div
          className={styles.gazeDot}
          style={{
            left: `${Math.min(Math.max(x, 5), 95)}%`,
            top: `${Math.min(Math.max(y, 5), 95)}%`,
          }}
        />
        {/* Cross-hair */}
        <div className={styles.gazeHLine} />
        <div className={styles.gazeVLine} />
      </div>
    </div>
  );
}
