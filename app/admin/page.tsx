"use client";

import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import type { MetricsPacket } from "../../hooks/useMetricsSender";
import styles from "./admin.module.css";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export default function AdminPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const [connected, setConnected] = useState(false);
  const [metrics, setMetrics] = useState<MetricsPacket | null>(null);
  const [metricsLog, setMetricsLog] = useState<MetricsPacket[]>([]);

  useEffect(() => {
    const signalingUrl =
      process.env.NEXT_PUBLIC_SIGNALING_URL ||
      (typeof window !== "undefined"
        ? `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname}:3002`
        : "ws://localhost:3002");

    const socket = io(signalingUrl, {
      transports: ["websocket"],
      reconnectionAttempts: 10,
    });
    socketRef.current = socket;

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;

    // Receive remote stream
    pc.ontrack = (event) => {
      console.log("[Admin] Remote stream received:", event.streams[0]);
      if (videoRef.current && event.streams[0]) {
        videoRef.current.srcObject = event.streams[0];
        setConnected(true);
      }
    };

    pc.onicecandidate = (e) => {
      if (e.candidate && socketRef.current) {
        socketRef.current.emit("signal", {
          type: "ice-candidate",
          payload: e.candidate.toJSON(),
          sender: "admin",
        });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log("[Admin] Connection state:", pc.connectionState);
      if (pc.connectionState === "connected") setConnected(true);
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected")
        setConnected(false);
    };

    // Handle signaling
    socket.on("signal", async (msg: { type: string; payload: any; sender: string }) => {
      if (msg.sender !== "client") return;

      if (msg.type === "offer") {
        console.log("[Admin] Received offer from client");
        await pc.setRemoteDescription(new RTCSessionDescription(msg.payload));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("signal", {
          type: "answer",
          payload: answer,
          sender: "admin",
        });
      } else if (msg.type === "ice-candidate") {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(msg.payload));
        } catch {
          // ignore
        }
      }
    });

    // Receive metrics
    socket.on("metrics", (packet: MetricsPacket) => {
      setMetrics(packet);
      setMetricsLog((prev) => [...prev.slice(-50), packet]); // keep last 50
    });

    socket.on("client-disconnected", () => {
      setConnected(false);
      if (videoRef.current) videoRef.current.srcObject = null;
    });

    socket.on("connect", () => {
      console.log("[Admin] Connected to signaling, joining room...");
      socket.emit("join", { role: "admin" });
      
      // Request offer immediately on connect
      socket.emit("request-offer");
    });

    // POLLING: Periodically request offer if not connected
    const pollInterval = setInterval(() => {
      if (!pcRef.current || pcRef.current.connectionState !== "connected") {
        console.log("[Admin] Not connected, retrying handshake...");
        socket.emit("request-offer");
      }
    }, 3000);

    return () => {
      clearInterval(pollInterval);
      pc.close();
      socket.disconnect();
    };
  }, []);

  // ── Derived state ────────────────────────────────────────────────────────
  const faceDetected = metrics?.face?.detected ?? false;
  const blinkCount = metricsLog.filter((m) => m.blink).length;

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.logo}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
              stroke="url(#ag)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            />
            <defs>
              <linearGradient id="ag" x1="2" y1="2" x2="22" y2="22">
                <stop stopColor="#6366f1" /><stop offset="1" stopColor="#a855f7" />
              </linearGradient>
            </defs>
          </svg>
          <span className={styles.logoText}>VeriStream</span>
          <span className={styles.badge}>ADMIN</span>
        </div>
        <div className={`${styles.pill} ${connected ? styles.pillLive : styles.pillOff}`}>
          <span className={styles.pillDot} />
          {connected ? "CLIENT CONNECTED" : "WAITING FOR CLIENT"}
        </div>
      </header>

      {/* Body */}
      <main className={styles.main}>
        {/* Video */}
        <section className={styles.videoSection}>
          <div className={styles.videoWrap}>
            {!connected && (
              <div className={styles.waiting}>
                <div className={styles.spinner} />
                <p>Waiting for client stream…</p>
              </div>
            )}
            <video ref={videoRef} autoPlay playsInline muted className={styles.video} />
            {metrics && (
              <div className={`${styles.faceChip} ${faceDetected ? styles.chipGreen : styles.chipRed}`}>
                <span className={styles.chipDot} />
                {faceDetected ? `Face · ${(metrics.face.confidence * 100).toFixed(0)}%` : "No Face"}
              </div>
            )}
          </div>
        </section>

        {/* Metrics sidebar */}
        <aside className={styles.sidebar}>
          <h2 className={styles.sideTitle}>Behavioral Telemetry</h2>

          {metrics ? (
            <>
              {/* Head Pose */}
              <Card title="🧭 Head Pose">
                <div className={styles.grid3}>
                  <Stat label="Yaw" value={`${metrics.headPose.yaw}°`} />
                  <Stat label="Pitch" value={`${metrics.headPose.pitch}°`} />
                  <Stat label="Roll" value={`${metrics.headPose.roll}°`} />
                </div>
              </Card>

              {/* Gaze */}
              <Card title="👁️ Gaze">
                <div className={styles.grid2}>
                  <Stat label="X" value={String(metrics.gaze.x)} />
                  <Stat label="Y" value={String(metrics.gaze.y)} />
                </div>
              </Card>

              {/* Blink & Focus */}
              <Card title="👁️ Blink & Focus">
                <div className={styles.chipRow}>
                  <span className={`${styles.tag} ${metrics.blink ? styles.tagRed : styles.tagGreen}`}>
                    {metrics.blink ? "Blinking" : "Eyes Open"}
                  </span>
                  <span className={`${styles.tag} ${metrics.tabActive ? styles.tagGreen : styles.tagRed}`}>
                    {metrics.tabActive ? "Tab Active" : "Tab Hidden"}
                  </span>
                </div>
                <p className={styles.blinkCount}>Blink events: {blinkCount}</p>
              </Card>

              {/* Typing */}
              <Card title="⌨️ Typing">
                <div className={styles.grid2}>
                  <Stat label="Keys" value={String(metrics.typing.keystrokes)} />
                  <Stat label="Speed" value={`${metrics.typing.currentSpeed} k/s`} />
                  <Stat label="Interval" value={`${metrics.typing.lastKeyInterval}ms`} />
                  <Stat label="Variance" value={String(Math.round(metrics.typing.intervalVariance))} />
                </div>
                {metrics.typing.intervalVariance < 50 && metrics.typing.keystrokes > 20 && (
                  <div className={styles.botWarning}>⚠️ Low variance — possible bot activity</div>
                )}
              </Card>

              {/* Raw JSON */}
              <Card title="📦 Latest Packet">
                <pre className={styles.json}>{JSON.stringify(metrics, null, 2)}</pre>
              </Card>
            </>
          ) : (
            <div className={styles.noData}>No metrics received yet</div>
          )}
        </aside>
      </main>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>{title}</div>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statValue}>{value}</span>
    </div>
  );
}
