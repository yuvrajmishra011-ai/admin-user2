"use client";

import { useEffect, useRef, useState } from "react";

export default function CameraTestPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const log = (msg: string) => {
    console.log(`[CameraTest] ${msg}`);
    setLogs((prev) => [...prev, `${new Date().toLocaleTimeString()} - ${msg}`]);
  };

  useEffect(() => {
    let isMounted = true;

    async function startCamera() {
      log("Initializing camera request...");
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error("navigator.mediaDevices is undefined (Requires HTTPS or localhost)");
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });

        if (!isMounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        log(`Camera feed started successfully! Track ID: ${stream.getVideoTracks()[0].id}`);
        setErrorMsg(null);

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err: any) {
        log(`Camera permission failed: ${err.name} - ${err.message}`);
        setErrorMsg(`Camera access denied. Reason: ${err.name || err.message}`);
      }
    }

    startCamera();

    return () => {
      isMounted = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        log("Camera feed stopped (cleanup).");
      }
    };
  }, []);

  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif", backgroundColor: "#111827", color: "#f9fafb", minHeight: "100vh" }}>
      <h1 style={{ marginBottom: "1rem", fontSize: "1.5rem" }}>Live Camera Testing Suite</h1>

      <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap", alignItems: "flex-start" }}>
        
        {/* Video Container */}
        <div style={{ flex: "1 1 500px" }}>
          {errorMsg ? (
            <div style={{ padding: "3rem", border: "2px dashed #ef4444", borderRadius: "10px", backgroundColor: "#7f1d1d", color: "#fca5a5" }}>
              <h2 style={{ fontSize: "1.2rem", fontWeight: "bold", marginBottom: "0.5rem" }}>⚠️ Access Issue</h2>
              <p>{errorMsg}</p>
            </div>
          ) : (
            <div style={{ borderRadius: "10px", overflow: "hidden", border: "2px solid #374151", backgroundColor: "black" }}>
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted
                style={{ width: "100%", height: "auto", display: "block", transform: "scaleX(-1)" }} 
              />
            </div>
          )}
        </div>

        {/* Logs Container */}
        <div style={{ flex: "1 1 300px", padding: "1rem", backgroundColor: "#1f2937", borderRadius: "10px", border: "1px solid #374151" }}>
          <h3 style={{ textTransform: "uppercase", fontSize: "0.8rem", color: "#9ca3af", marginBottom: "1rem" }}>System Logs</h3>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "0.85rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {logs.map((msg, idx) => (
              <li key={idx} style={{ color: msg.includes("failed") || msg.includes("denied") ? "#ef4444" : "#a7f3d0" }}>
                {msg}
              </li>
            ))}
          </ul>
        </div>
        
      </div>
    </div>
  );
}
