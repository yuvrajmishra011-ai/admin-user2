"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import styles from "./LandingPage.module.css";

// ── Animated counter hook ──────────────────────────────────────────────────────
function useCounter(target: number, duration = 2000, start = false) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!start) return;
    let startTime: number | null = null;
    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration, start]);
  return count;
}

// ── Intersection observer hook ─────────────────────────────────────────────────
function useInView(threshold = 0.2) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setInView(true); },
      { threshold }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, inView };
}

// ── Particle canvas ────────────────────────────────────────────────────────────
function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const particles: {
      x: number; y: number; vx: number; vy: number;
      size: number; opacity: number; color: string;
    }[] = [];
    const colors = ["#6366f1", "#a855f7", "#06b6d4", "#10b981"];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    for (let i = 0; i < 80; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        size: Math.random() * 2 + 0.5,
        opacity: Math.random() * 0.5 + 0.1,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p, i) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.opacity;
        ctx.fill();

        // Draw connections
        particles.slice(i + 1).forEach((p2) => {
          const dx = p.x - p2.x;
          const dy = p.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = p.color;
            ctx.globalAlpha = (1 - dist / 120) * 0.15;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        });
      });
      ctx.globalAlpha = 1;
      animId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);
  return <canvas ref={canvasRef} className={styles.particleCanvas} />;
}

// ── Gaze tracker visualization ─────────────────────────────────────────────────
function GazeDemo() {
  const [pos, setPos] = useState({ x: 50, y: 50 });
  const [zone, setZone] = useState("CENTER");
  const [alert, setAlert] = useState(false);
  const animRef = useRef<number>(0);
  const timeRef = useRef(0);

  useEffect(() => {
    const animate = (t: number) => {
      const dt = t - timeRef.current;
      timeRef.current = t;
      const nx = 50 + Math.sin(t * 0.001) * 30 + Math.sin(t * 0.0013) * 10;
      const ny = 50 + Math.cos(t * 0.0008) * 20 + Math.cos(t * 0.0015) * 8;
      setPos({ x: nx, y: ny });
      const offCenter = Math.abs(nx - 50) > 25 || Math.abs(ny - 50) > 20;
      setAlert(offCenter);
      if (nx < 35) setZone("LEFT ⚠️");
      else if (nx > 65) setZone("RIGHT ⚠️");
      else if (ny < 35) setZone("UP");
      else if (ny > 65) setZone("DOWN");
      else setZone("CENTER ✓");
      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  return (
    <div className={styles.gazeDemo}>
      <div className={styles.gazeScreen}>
        <div className={styles.gazeGrid}>
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className={`${styles.gazeCell} ${i === 4 ? styles.gazeCellCenter : ""}`} />
          ))}
        </div>
        <div
          className={`${styles.gazePoint} ${alert ? styles.gazePointAlert : ""}`}
          style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
        />
        <div className={styles.gazeHLine} />
        <div className={styles.gazeVLine} />
        <div className={`${styles.gazeZone} ${alert ? styles.gazeZoneAlert : styles.gazeZoneOk}`}>
          {zone}
        </div>
        <div className={styles.gazeScanLine} />
      </div>
      <div className={styles.gazeStats}>
        <div className={styles.gazeStat}>
          <span className={styles.gazeStatLabel}>GAZE X</span>
          <span className={styles.gazeStatValue}>{((pos.x - 50) / 50).toFixed(3)}</span>
        </div>
        <div className={styles.gazeStat}>
          <span className={styles.gazeStatLabel}>GAZE Y</span>
          <span className={styles.gazeStatValue}>{((pos.y - 50) / 50).toFixed(3)}</span>
        </div>
        <div className={styles.gazeStat}>
          <span className={styles.gazeStatLabel}>ZONE</span>
          <span className={`${styles.gazeStatValue} ${alert ? styles.gazeAlertText : styles.gazeOkText}`}>
            {zone}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Deepfake detection demo ────────────────────────────────────────────────────
function DeepfakeDemo() {
  const [score, setScore] = useState(0.12);
  const [status, setStatus] = useState<"genuine" | "suspicious" | "fake">("genuine");
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setFrame((f) => {
        const nf = (f + 1) % 120;
        // simulate detection scores
        let ns = 0.12 + Math.sin(nf * 0.15) * 0.08 + Math.random() * 0.04;
        if (nf > 60 && nf < 90) ns = 0.72 + Math.random() * 0.18; // fake burst
        ns = Math.max(0, Math.min(1, ns));
        setScore(ns);
        if (ns < 0.35) setStatus("genuine");
        else if (ns < 0.65) setStatus("suspicious");
        else setStatus("fake");
        return nf;
      });
    }, 100);
    return () => clearInterval(id);
  }, []);

  const bars = Array.from({ length: 24 }).map((_, i) => {
    const v = 0.1 + Math.abs(Math.sin(i * 0.4 + frame * 0.05)) * 0.8;
    return v;
  });

  return (
    <div className={styles.dfDemo}>
      {/* Face scan */}
      <div className={styles.dfFace}>
        <div className={`${styles.dfFaceFrame} ${styles[`dfFrame_${status}`]}`}>
          <svg viewBox="0 0 100 100" className={styles.dfSvg}>
            <ellipse cx="50" cy="45" rx="22" ry="26" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2" />
            <circle cx="42" cy="42" r="3.5" fill="none" stroke="currentColor" strokeWidth="1" />
            <circle cx="58" cy="42" r="3.5" fill="none" stroke="currentColor" strokeWidth="1" />
            <path d="M43 54 Q50 58 57 54" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            <line x1="30" y1="20" x2="70" y2="20" stroke="currentColor" strokeWidth="0.5" opacity="0.4" />
            <line x1="20" y1="50" x2="80" y2="50" stroke="currentColor" strokeWidth="0.5" opacity="0.4" />
            <line x1="30" y1="80" x2="70" y2="80" stroke="currentColor" strokeWidth="0.5" opacity="0.4" />
            {/* landmark dots */}
            {[[40,35],[60,35],[50,50],[44,58],[56,58],[35,42],[65,42]].map(([cx,cy], i) => (
              <circle key={i} cx={cx} cy={cy} r="1.2" fill="currentColor" opacity="0.6" />
            ))}
          </svg>
          <div className={styles.dfScanBeam} />
          <div className={`${styles.dfStatus} ${styles[`dfStatus_${status}`]}`}>
            {status === "genuine" ? "✓ GENUINE" : status === "suspicious" ? "⚠ SUSPICIOUS" : "✗ DEEPFAKE"}
          </div>
        </div>
      </div>
      {/* Score bar */}
      <div className={styles.dfScore}>
        <div className={styles.dfScoreLabel}>
          <span>Authenticity Score</span>
          <span className={`${styles.dfScoreNum} ${styles[`dfScore_${status}`]}`}>
            {((1 - score) * 100).toFixed(1)}%
          </span>
        </div>
        <div className={styles.dfBar}>
          <div
            className={`${styles.dfBarFill} ${styles[`dfBarFill_${status}`]}`}
            style={{ width: `${(1 - score) * 100}%` }}
          />
        </div>
        {/* Frequency bars */}
        <div className={styles.dfBars}>
          {bars.map((v, i) => (
            <div
              key={i}
              className={`${styles.dfBarItem} ${styles[`dfBarItem_${status}`]}`}
              style={{ height: `${v * 40}px` }}
            />
          ))}
        </div>
        <div className={styles.dfMetrics}>
          <span>Texture: <b>{(0.94 - score * 0.3).toFixed(2)}</b></span>
          <span>Blink: <b>{(0.91 - score * 0.4).toFixed(2)}</b></span>
          <span>Depth: <b>{(0.89 - score * 0.2).toFixed(2)}</b></span>
        </div>
      </div>
    </div>
  );
}

// ── Multi-camera grid demo ─────────────────────────────────────────────────────
function MultiCamDemo() {
  const [active, setActive] = useState(0);
  const [alerts, setAlerts] = useState([false, false, false, false]);

  useEffect(() => {
    const id = setInterval(() => {
      setAlerts([
        Math.random() > 0.85,
        Math.random() > 0.9,
        Math.random() > 0.8,
        Math.random() > 0.92,
      ]);
    }, 1800);
    return () => clearInterval(id);
  }, []);

  const cams = [
    { id: "CAM-01", label: "Student A", status: alerts[0] ? "alert" : "ok" },
    { id: "CAM-02", label: "Student B", status: alerts[1] ? "alert" : "ok" },
    { id: "CAM-03", label: "Student C", status: alerts[2] ? "alert" : "ok" },
    { id: "CAM-04", label: "Student D", status: "ok" as const },
  ];

  return (
    <div className={styles.mcDemo}>
      <div className={styles.mcGrid}>
        {cams.map((cam, i) => (
          <div
            key={cam.id}
            className={`${styles.mcCell} ${active === i ? styles.mcCellActive : ""} ${cam.status === "alert" ? styles.mcCellAlert : ""}`}
            onClick={() => setActive(i)}
          >
            <div className={styles.mcCellInner}>
              <div className={styles.mcScanLine} />
              <svg viewBox="0 0 80 60" className={styles.mcFaceSvg}>
                <ellipse cx="40" cy="30" rx="16" ry="19" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.5" />
                <circle cx="35" cy="26" r="2.5" fill="none" stroke="currentColor" strokeWidth="0.8" />
                <circle cx="45" cy="26" r="2.5" fill="none" stroke="currentColor" strokeWidth="0.8" />
                <path d="M34 36 Q40 40 46 36" fill="none" stroke="currentColor" strokeWidth="0.8" />
              </svg>
              <div className={styles.mcCornerTL} />
              <div className={styles.mcCornerTR} />
              <div className={styles.mcCornerBL} />
              <div className={styles.mcCornerBR} />
            </div>
            <div className={styles.mcLabel}>
              <span className={`${styles.mcDot} ${cam.status === "alert" ? styles.mcDotAlert : styles.mcDotOk}`} />
              <span>{cam.id}</span>
              <span className={styles.mcName}>{cam.label}</span>
              {cam.status === "alert" && <span className={styles.mcAlertBadge}>⚠ ALERT</span>}
            </div>
          </div>
        ))}
      </div>
      {/* Main view */}
      <div className={styles.mcMain}>
        <div className={styles.mcMainHeader}>
          <span>{cams[active].id} — {cams[active].label}</span>
          <span className={`${styles.mcMainStatus} ${alerts[active] ? styles.mcMainStatusAlert : styles.mcMainStatusOk}`}>
            {alerts[active] ? "⚠ SUSPICIOUS BEHAVIOR" : "✓ MONITORING"}
          </span>
        </div>
        <div className={styles.mcMainFeed}>
          <div className={styles.mcMainScan} />
          <svg viewBox="0 0 200 150" className={styles.mcMainFaceSvg}>
            <ellipse cx="100" cy="75" rx="38" ry="46" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.6" />
            <circle cx="87" cy="65" r="6" fill="none" stroke="currentColor" strokeWidth="1.2" />
            <circle cx="113" cy="65" r="6" fill="none" stroke="currentColor" strokeWidth="1.2" />
            <path d="M87 90 Q100 100 113 90" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="60" y1="30" x2="140" y2="30" stroke="currentColor" strokeWidth="0.5" opacity="0.3" />
            <line x1="60" y1="75" x2="140" y2="75" stroke="currentColor" strokeWidth="0.5" opacity="0.3" />
            <line x1="60" y1="120" x2="140" y2="120" stroke="currentColor" strokeWidth="0.5" opacity="0.3" />
            {[[87,55],[113,55],[100,80],[91,92],[109,92],[75,55],[125,55],[88,45],[112,45]].map(([cx,cy], i) => (
              <circle key={i} cx={cx} cy={cy} r="1.8" fill="currentColor" opacity="0.7" />
            ))}
          </svg>
          <div className={styles.mcMainCornerTL} />
          <div className={styles.mcMainCornerTR} />
          <div className={styles.mcMainCornerBL} />
          <div className={styles.mcMainCornerBR} />
        </div>
      </div>
    </div>
  );
}

// ── Stat card ──────────────────────────────────────────────────────────────────
function StatCard({ value, label, suffix = "", start }: { value: number; label: string; suffix?: string; start: boolean }) {
  const count = useCounter(value, 2200, start);
  return (
    <div className={styles.statCard}>
      <div className={styles.statValue}>{count.toLocaleString()}{suffix}</div>
      <div className={styles.statLabel}>{label}</div>
    </div>
  );
}

// ── Main landing page ──────────────────────────────────────────────────────────
export default function LandingPage() {
  const [navScrolled, setNavScrolled] = useState(false);
  const { ref: statsRef, inView: statsInView } = useInView(0.3);
  const { ref: gazeRef, inView: gazeInView } = useInView(0.2);
  const { ref: dfRef, inView: dfInView } = useInView(0.2);
  const { ref: mcRef, inView: mcInView } = useInView(0.2);

  useEffect(() => {
    const onScroll = () => setNavScrolled(window.scrollY > 30);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className={styles.page}>
      <ParticleCanvas />

      {/* ── NAV ─────────────────────────────────────────────────────────── */}
      <nav className={`${styles.nav} ${navScrolled ? styles.navScrolled : ""}`}>
        <div className={styles.navInner}>
          <div className={styles.navLogo}>
            <div className={styles.navLogoIcon}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="url(#lg1)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <defs>
                  <linearGradient id="lg1" x1="2" y1="2" x2="22" y2="22">
                    <stop stopColor="#6366f1" />
                    <stop offset="1" stopColor="#a855f7" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <span className={styles.navLogoText}>VeriStream</span>
            <span className={styles.navBadge}>AI</span>
          </div>
          <div className={styles.navLinks}>
            <a href="#features" className={styles.navLink}>Features</a>
            <a href="#gaze" className={styles.navLink}>Gaze Monitor</a>
            <a href="#deepfake" className={styles.navLink}>Deepfake AI</a>
            <a href="#multicam" className={styles.navLink}>Multi-Cam</a>
          </div>
          <div className={styles.navActions}>
            <Link href="/monitor" className={styles.navBtnSecondary}>Launch Monitor</Link>
            <Link href="/admin" className={styles.navBtnPrimary}>
              <span>Admin Dashboard</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>
      </nav>

      {/* ── HERO ────────────────────────────────────────────────────────── */}
      <section className={styles.hero}>
        <div className={styles.heroBg}>
          <div className={styles.heroOrb1} />
          <div className={styles.heroOrb2} />
          <div className={styles.heroOrb3} />
          <div className={styles.heroGrid} />
        </div>

        <div className={styles.heroContent}>
          <div className={styles.heroPill}>
            <span className={styles.heroPillDot} />
            AI-Powered Integrity Verification
          </div>
          <h1 className={styles.heroTitle}>
            <span className={styles.heroTitleLine1}>Detect Every</span>
            <span className={styles.heroTitleGradient}>Deepfake. Flag Every</span>
            <span className={styles.heroTitleLine3}>Cheat. In Real-Time.</span>
          </h1>
          <p className={styles.heroSubtitle}>
            VeriStream combines gaze tracking, deepfake neural networks, and
            multi-camera behavioral analysis to deliver uncompromising exam
            integrity at scale.
          </p>
          <div className={styles.heroCtas}>
            <Link href="/admin" className={styles.heroCtaPrimary}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <path d="M8 21h8M12 17v4" />
              </svg>
              Open Admin Dashboard
            </Link>
            <Link href="/monitor" className={styles.heroCtaSecondary}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" />
              </svg>
              Launch Live Monitor
            </Link>
          </div>
          <div className={styles.heroTechStack}>
            {["MediaPipe FaceMesh", "WebRTC", "Socket.IO", "CNN Deepfake AI", "Gaze Estimation"].map((t) => (
              <span key={t} className={styles.heroTechTag}>{t}</span>
            ))}
          </div>
        </div>

        {/* Hero visual */}
        <div className={styles.heroVisual}>
          <div className={styles.heroVisualInner}>
            <div className={styles.heroHud}>
              {/* HUD bars */}
              <div className={styles.hudTopBar}>
                <span className={styles.hudLive}>● LIVE</span>
                <span>SESSION #A4-9</span>
                <span>12 CANDIDATES</span>
              </div>
              {/* Face grid */}
              <div className={styles.hudFaceGrid}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className={`${styles.hudFaceCell} ${i === 2 ? styles.hudFaceCellAlert : ""}`}>
                    <svg viewBox="0 0 60 60" className={styles.hudFaceSvg}>
                      <ellipse cx="30" cy="30" rx="14" ry="17" fill="none" stroke="currentColor" strokeWidth="1" />
                      <circle cx="26" cy="26" r="2" fill="none" stroke="currentColor" strokeWidth="0.8" />
                      <circle cx="34" cy="26" r="2" fill="none" stroke="currentColor" strokeWidth="0.8" />
                      <path d="M26 36 Q30 39 34 36" fill="none" stroke="currentColor" strokeWidth="0.8" />
                    </svg>
                    <div className={styles.hudFaceScan} />
                    {i === 2 && <div className={styles.hudFaceAlertBadge}>⚠</div>}
                  </div>
                ))}
              </div>
              {/* Telemetry bars */}
              <div className={styles.hudTelemetry}>
                <HudBar label="GAZE-X" value={0.73} color="#6366f1" />
                <HudBar label="DEEPFAKE" value={0.08} color="#10b981" />
                <HudBar label="BEHAVIOR" value={0.91} color="#a855f7" />
                <HudBar label="FOCUS" value={0.85} color="#06b6d4" />
              </div>
              <div className={styles.hudBottomBar}>
                <span>11 ✓ GENUINE</span>
                <span className={styles.hudBottomAlert}>1 ⚠ SUSPICIOUS</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS ───────────────────────────────────────────────────────── */}
      <section className={styles.stats} ref={statsRef}>
        <div className={styles.statsInner}>
          <StatCard value={99} suffix="%" label="Deepfake Detection Accuracy" start={statsInView} />
          <StatCard value={16} suffix="ms" label="Real-Time Gaze Latency" start={statsInView} />
          <StatCard value={12} label="Simultaneous Camera Feeds" start={statsInView} />
          <StatCard value={50000} label="Sessions Verified" start={statsInView} />
        </div>
      </section>

      {/* ── FEATURES ────────────────────────────────────────────────────── */}
      <section className={styles.features} id="features">
        <div className={styles.sectionHeader}>
          <div className={styles.sectionPill}>Platform Capabilities</div>
          <h2 className={styles.sectionTitle}>Every Layer of Integrity</h2>
          <p className={styles.sectionDesc}>
            Three AI-powered defense systems working in unison to eliminate academic dishonesty.
          </p>
        </div>
        <div className={styles.featureGrid}>
          {[
            {
              icon: (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M2 20c0-4 4-7 10-7s10 3 10 7" />
                  <circle cx="12" cy="8" r="1.5" fill="currentColor" />
                </svg>
              ),
              accent: "#6366f1",
              title: "Gaze Monitoring",
              desc: "Real-time eye tracking with MediaPipe FaceMesh detects off-screen saccades, prolonged gaze deviation, and suspicious head pose within milliseconds.",
              tags: ["Eye Tracking", "Head Pose", "Blink Analysis"],
            },
            {
              icon: (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
              ),
              accent: "#a855f7",
              title: "Deepfake Detection",
              desc: "CNN-based neural network analyzes facial texture, depth consistency, and micro-expression anomalies to flag synthetic media with 99%+ accuracy.",
              tags: ["CNN Analysis", "Texture AI", "Liveness Check"],
            },
            {
              icon: (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="2" y="2" width="9" height="9" rx="1" />
                  <rect x="13" y="2" width="9" height="9" rx="1" />
                  <rect x="2" y="13" width="9" height="9" rx="1" />
                  <rect x="13" y="13" width="9" height="9" rx="1" />
                </svg>
              ),
              accent: "#06b6d4",
              title: "Multi-Camera Admin",
              desc: "Unified command dashboard streams up to 12 live feeds simultaneously. Smart alerts surface suspicious candidates instantly with one-click zoom.",
              tags: ["12 Cam Feeds", "Smart Alerts", "WebRTC P2P"],
            },
            {
              icon: (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
              ),
              accent: "#10b981",
              title: "Behavioral Telemetry",
              desc: "Keystroke dynamics, typing speed variance, and tab-switching patterns are analyzed continuously to identify bot-assisted or human-aided cheating.",
              tags: ["Keystroke AI", "Tab Monitor", "Variance Score"],
            },
            {
              icon: (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              ),
              accent: "#f59e0b",
              title: "Real-Time Alerting",
              desc: "WebSocket-driven alert pipeline delivers sub-100ms notifications to admins the moment any anomaly threshold is crossed during a live session.",
              tags: ["Socket.IO", "Instant Notify", "Event Log"],
            },
            {
              icon: (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <ellipse cx="12" cy="5" rx="9" ry="3" />
                  <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                  <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                </svg>
              ),
              accent: "#ef4444",
              title: "Secure Data Pipeline",
              desc: "End-to-end encrypted metric packets with structured biometric telemetry. GDPR-compliant storage with full audit trails and session playback.",
              tags: ["E2E Encrypt", "Audit Trail", "GDPR Ready"],
            },
          ].map((f) => (
            <div key={f.title} className={styles.featureCard} style={{ "--accent": f.accent } as React.CSSProperties}>
              <div className={styles.featureCardGlow} />
              <div className={styles.featureIcon} style={{ color: f.accent }}>{f.icon}</div>
              <h3 className={styles.featureTitle}>{f.title}</h3>
              <p className={styles.featureDesc}>{f.desc}</p>
              <div className={styles.featureTags}>
                {f.tags.map((tag) => (
                  <span key={tag} className={styles.featureTag} style={{ color: f.accent, borderColor: `${f.accent}44` }}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── GAZE SECTION ────────────────────────────────────────────────── */}
      <section className={styles.techSection} id="gaze" ref={gazeRef}>
        <div className={`${styles.techInner} ${gazeInView ? styles.techInnerVisible : ""}`}>
          <div className={styles.techContent}>
            <div className={styles.sectionPill}>Module 01</div>
            <h2 className={styles.techTitle}>
              Gaze Monitoring
              <span className={styles.techTitleAccent}> Engine</span>
            </h2>
            <p className={styles.techDesc}>
              468-point FaceMesh landmarks track where your eyes look every 16ms.
              Zone-based detection flags off-screen gaze, suspicious head orientation,
              and eye closure patterns in real time, sending immediate alerts to the
              admin dashboard.
            </p>
            <ul className={styles.techList}>
              <li>● 468 facial landmark tracking via MediaPipe</li>
              <li>● Sub-20ms gaze estimation latency</li>
              <li>● Pitch / Yaw / Roll head pose analysis</li>
              <li>● Automatic alert on sustained off-center gaze</li>
              <li>● Blink rate anomaly detection</li>
            </ul>
            <Link href="/monitor" className={styles.techBtn} style={{ "--accent": "#6366f1" } as React.CSSProperties}>
              Try Gaze Monitor →
            </Link>
          </div>
          <div className={styles.techDemo} style={{ "--accent": "#6366f1" } as React.CSSProperties}>
            <GazeDemo />
          </div>
        </div>
      </section>

      {/* ── DEEPFAKE SECTION ────────────────────────────────────────────── */}
      <section className={`${styles.techSection} ${styles.techSectionAlt}`} id="deepfake" ref={dfRef}>
        <div className={`${styles.techInner} ${styles.techInnerReverse} ${dfInView ? styles.techInnerVisible : ""}`}>
          <div className={styles.techDemo} style={{ "--accent": "#a855f7" } as React.CSSProperties}>
            <DeepfakeDemo />
          </div>
          <div className={styles.techContent}>
            <div className={styles.sectionPill}>Module 02</div>
            <h2 className={styles.techTitle}>
              Deepfake
              <span className={styles.techTitleAccent2}> Detection AI</span>
            </h2>
            <p className={styles.techDesc}>
              Our convolutional neural network analyzes every incoming video frame
              for synthetic artifacts — GAN fingerprints, blending boundaries,
              temporal inconsistencies — and scores authenticity live.
            </p>
            <ul className={styles.techList}>
              <li>● CNN-based per-frame analysis</li>
              <li>● Texture coherence & depth-map validation</li>
              <li>● Temporal consistency scoring</li>
              <li>● 99.3% accuracy on benchmark datasets</li>
              <li>● Flags face-swap, puppet, and GAN-generated media</li>
            </ul>
            <Link href="/admin" className={styles.techBtn} style={{ "--accent": "#a855f7" } as React.CSSProperties}>
              Open Admin View →
            </Link>
          </div>
        </div>
      </section>

      {/* ── MULTI-CAM SECTION ───────────────────────────────────────────── */}
      <section className={styles.techSection} id="multicam" ref={mcRef}>
        <div className={`${styles.techInner} ${mcInView ? styles.techInnerVisible : ""}`}>
          <div className={styles.techContent}>
            <div className={styles.sectionPill}>Module 03</div>
            <h2 className={styles.techTitle}>
              Admin Dashboard
              <span className={styles.techTitleAccent3}> Multi-View</span>
            </h2>
            <p className={styles.techDesc}>
              A unified command center lets administrators monitor up to 12
              simultaneous WebRTC streams, review live telemetry, and act on
              smart alerts — all from a single interface.
            </p>
            <ul className={styles.techList}>
              <li>● 12-way simultaneous WebRTC feed grid</li>
              <li>● One-click focus on flagged candidate</li>
              <li>● Live behavioral telemetry sidebar</li>
              <li>● Smart alert classification & event log</li>
              <li>● Exportable session report with full audit trail</li>
            </ul>
            <Link href="/admin" className={styles.techBtn} style={{ "--accent": "#06b6d4" } as React.CSSProperties}>
              Open Multi-View Dashboard →
            </Link>
          </div>
          <div className={styles.techDemo} style={{ "--accent": "#06b6d4" } as React.CSSProperties}>
            <MultiCamDemo />
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────────────── */}
      <section className={styles.cta}>
        <div className={styles.ctaBg}>
          <div className={styles.ctaOrb1} />
          <div className={styles.ctaOrb2} />
        </div>
        <div className={styles.ctaContent}>
          <h2 className={styles.ctaTitle}>Ready to Secure Your Next Exam?</h2>
          <p className={styles.ctaDesc}>
            Launch the admin dashboard to monitor candidates in real time,
            or open the student monitor to begin session setup.
          </p>
          <div className={styles.ctaBtns}>
            <Link href="/admin" className={styles.heroCtaPrimary}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <path d="M8 21h8M12 17v4" />
              </svg>
              Admin Command Center
            </Link>
            <Link href="/monitor" className={styles.heroCtaSecondary}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 7l-7 5 7 5V7z" />
                <rect x="1" y="5" width="15" height="14" rx="2" />
              </svg>
              Student Monitor
            </Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────────────────── */}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerLogo}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="url(#lf)" strokeWidth="2" strokeLinecap="round" />
              <defs>
                <linearGradient id="lf" x1="2" y1="2" x2="22" y2="22">
                  <stop stopColor="#6366f1" />
                  <stop offset="1" stopColor="#a855f7" />
                </linearGradient>
              </defs>
            </svg>
            <span>VeriStream</span>
          </div>
          <p className={styles.footerText}>
            AI-Powered Behavioral Integrity Platform · Built with MediaPipe, WebRTC & Next.js
          </p>
          <div className={styles.footerLinks}>
            <Link href="/monitor" className={styles.footerLink}>Monitor</Link>
            <Link href="/admin" className={styles.footerLink}>Admin</Link>
            <Link href="/camera-test" className={styles.footerLink}>Camera Test</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ── HUD bar sub-component ──────────────────────────────────────────────────────
function HudBar({ label, value, color }: { label: string; value: number; color: string }) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setInterval(() => {
      setV(Math.max(0.05, Math.min(0.98, value + (Math.random() - 0.5) * 0.15)));
    }, 800);
    return () => clearInterval(id);
  }, [value]);
  return (
    <div className={styles.hudBar}>
      <span className={styles.hudBarLabel}>{label}</span>
      <div className={styles.hudBarTrack}>
        <div className={styles.hudBarFill} style={{ width: `${v * 100}%`, background: color }} />
      </div>
      <span className={styles.hudBarValue} style={{ color }}>{(v * 100).toFixed(0)}%</span>
    </div>
  );
}
