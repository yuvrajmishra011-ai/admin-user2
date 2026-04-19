"use client";

import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import type { MetricsPacket } from "../../hooks/useMetricsSender";
import styles from "./admin.module.css";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  {
    urls: "turn:openrelay.metered.ca:80",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

export default function AdminPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const [connected, setConnected] = useState(false);
  const [metrics, setMetrics] = useState<MetricsPacket | null>(null);
  const [metricsLog, setMetricsLog] = useState<MetricsPacket[]>([]);

  useEffect(() => {
    let cancelled = false;
    
    // Ensure singletons per mount lifecycle
    console.log("[Admin] Initializing unified WebSocket connection...");
    const localSocket = io(undefined, {
      transports: ["websocket"],
      reconnectionAttempts: 10,
    });
    socketRef.current = localSocket;

    const localPc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = localPc;

    // Receive remote stream
    localPc.ontrack = (event) => {
      if (cancelled) return;
      console.log("[Admin] Remote stream received:", event.streams[0]);
      if (videoRef.current && event.streams[0]) {
        videoRef.current.srcObject = event.streams[0];
        setConnected(true);
      }
    };

    localPc.onicecandidate = (e) => {
      if (e.candidate && localSocket && !cancelled) {
        console.log("[Admin] ❄️ Generated ICE Candidate, sending to Client...");
        localSocket.emit("signal", {
          type: "ice-candidate",
          payload: e.candidate.toJSON(),
          sender: "admin",
        });
      }
    };

    localPc.oniceconnectionstatechange = () => {
      if (cancelled) return;
      console.log(`[Admin] ICE Connection State: ${localPc.iceConnectionState}`);
    };

    localPc.onconnectionstatechange = () => {
      if (cancelled) return;
      console.log("[Admin] Connection state:", localPc.connectionState);
      if (localPc.connectionState === "connected") setConnected(true);
      if (localPc.connectionState === "failed" || localPc.connectionState === "disconnected")
        setConnected(false);
    };

    // Handle signaling
    localSocket.on("signal", async (msg: { type: string; payload: any; sender: string }) => {
      if (cancelled || msg.sender !== "client" || localPc.signalingState === "closed") return;

      if (msg.type === "offer") {
        console.log("[Admin] 📥 Received offer from client");
        try {
          await localPc.setRemoteDescription(new RTCSessionDescription(msg.payload));
          if (cancelled || localPc.signalingState === "closed") return;
          
          const answer = await localPc.createAnswer();
          if (cancelled || localPc.signalingState === "closed") return;
          
          await localPc.setLocalDescription(answer);
          if (cancelled || localPc.signalingState === "closed") return;
          
          console.log("[Admin] 📤 Sending answer back to client");
          localSocket.emit("signal", {
            type: "answer",
            payload: answer,
            sender: "admin",
          });
        } catch (err) {
          if (!cancelled) console.error("[Admin] Offer processing failed:", err);
        }
      } else if (msg.type === "ice-candidate") {
        try {
          console.log("[Admin] 🧊 Received ICE Candidate from Client, adding...");
          await localPc.addIceCandidate(new RTCIceCandidate(msg.payload));
        } catch (err) {
          console.error("[Admin] Failed to add ICE candidate:", err);
        }
      }
    });

    // Receive metrics
    localSocket.on("metrics", (packet: MetricsPacket) => {
      if (cancelled) return;
      setMetrics(packet);
      setMetricsLog((prev) => [...prev.slice(-50), packet]); // keep last 50
    });

    localSocket.on("client-disconnected", () => {
      if (cancelled) return;
      console.log("[Admin] 🔴 Client disconnected");
      setConnected(false);
      if (videoRef.current) videoRef.current.srcObject = null;
    });

    localSocket.on("connect", () => {
      if (cancelled) return;
      console.log("[Admin] 🟢 Connected to signaling, joining room...");
      localSocket.emit("join", { role: "admin" });
      
      // Request offer immediately on connect
      localSocket.emit("request-offer");
    });

    // POLLING: Periodically request offer if not connected
    const pollInterval = setInterval(() => {
      if (cancelled) return;
      if (!pcRef.current || pcRef.current.connectionState !== "connected") {
        console.log("[Admin] Handshake poll: Not connected, requesting offer...");
        localSocket.emit("request-offer");
      }
    }, 3000);

    return () => {
      console.log("[Admin] 🧹 Cleaning up connection singleton...");
      cancelled = true;
      clearInterval(pollInterval);
      if (localPc) localPc.close();
      if (localSocket) localSocket.disconnect();
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
