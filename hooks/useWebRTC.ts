"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

// ── Types ──────────────────────────────────────────────────────────────────────
export interface WebRTCState {
  status: "idle" | "connecting" | "connected" | "failed";
  localStream: MediaStream | null;
  error: string | null;
}

interface SignalingMessage {
  type: "offer" | "answer" | "ice-candidate";
  payload: any;
  sender: "client" | "admin";
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

// ── Hook ───────────────────────────────────────────────────────────────────────
export function useWebRTC(
  signalingUrl: string = typeof window !== "undefined"
    ? process.env.NEXT_PUBLIC_SIGNALING_URL || `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname}:3002`
    : "ws://localhost:3002"
) {
  const [state, setState] = useState<WebRTCState>({
    status: "idle",
    localStream: null,
    error: null,
  });

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // ── Cleanup helper ─────────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  // ── Init ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        setState((s) => ({ ...s, status: "connecting", error: null }));

        // 1. Get camera stream
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, frameRate: 30 },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        setState((s) => ({ ...s, localStream: stream }));

        // 2. Connect to signaling server
        const socket = io(signalingUrl, {
          transports: ["websocket"],
          reconnectionAttempts: 5,
        });
        socketRef.current = socket;

        // 3. Create peer connection
        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        pcRef.current = pc;

        // Add tracks to peer connection
        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });

        // ICE candidates → send to admin via signaling
        pc.onicecandidate = (e) => {
          if (e.candidate && socketRef.current) {
            socketRef.current.emit("signal", {
              type: "ice-candidate",
              payload: e.candidate.toJSON(),
              sender: "client",
            } as SignalingMessage);
          }
        };

        pc.onconnectionstatechange = () => {
          const s = pc.connectionState;
          if (s === "connected") {
            setState((prev) => ({ ...prev, status: "connected" }));
          } else if (s === "failed" || s === "disconnected") {
            setState((prev) => ({
              ...prev,
              status: "failed",
              error: `Connection ${s}`,
            }));
          }
        };

        // Handle signaling messages from admin
        socket.on("signal", async (msg: SignalingMessage) => {
          if (msg.sender === "admin") {
            if (msg.type === "answer" && pc.signalingState === "have-local-offer") {
              await pc.setRemoteDescription(
                new RTCSessionDescription(msg.payload)
              );
            } else if (msg.type === "ice-candidate") {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(msg.payload));
              } catch {
                // Ignore ICE errors for candidates arriving before remote desc
              }
            }
          }
        });

        // When signaling connects, create offer
        socket.on("connect", async () => {
          // Wait briefly for admin to connect
          socket.emit("join", { role: "client" });
        });

        // Admin requests an offer
        socket.on("request-offer", async () => {
          console.log("[WebRTC] Received request-offer from signaling");
          if (!pcRef.current) return;
          
          // If we are already connected, we might need to re-negotiate
          // In some cases, resetting the PC might be cleaner, 
          // but for now we just create a fresh offer.
          try {
            const offer = await pcRef.current.createOffer({ iceRestart: true });
            await pcRef.current.setLocalDescription(offer);
            
            console.log("[WebRTC] Sending offer to admin...");
            socket.emit("signal", {
              type: "offer",
              payload: offer,
              sender: "client",
            } as SignalingMessage);
          } catch (err) {
            console.error("[WebRTC] Failed to create offer:", err);
          }
        });
      } catch (err: any) {
        if (!cancelled) {
          setState({
            status: "failed",
            localStream: null,
            error: err?.message || "Camera access denied",
          });
        }
      }
    }

    start();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [signalingUrl, cleanup]);

  return state;
}
