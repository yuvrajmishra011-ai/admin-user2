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

// ── Hook ───────────────────────────────────────────────────────────────────────
export function useWebRTC(
  signalingUrl: string | undefined = undefined
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
    let localSocket: Socket | null = null;
    let localPc: RTCPeerConnection | null = null;
    let localStream: MediaStream | null = null;

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
        localStream = stream;
        setState((s) => ({ ...s, localStream: stream }));

        // 2. Connect to signaling server
        console.log("[WebRTC Client] Initializing unified WebSocket connection...");
        localSocket = io(signalingUrl, {
          transports: ["websocket"],
          reconnectionAttempts: 5,
        });
        socketRef.current = localSocket;

        // 3. Create peer connection
        localPc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        pcRef.current = localPc;

        // Add tracks to peer connection
        stream.getTracks().forEach((track) => {
          localPc!.addTrack(track, stream);
        });

        // ICE candidates → send to admin via signaling
        localPc.onicecandidate = (e) => {
          if (e.candidate && localSocket && !cancelled) {
            console.log("[WebRTC Client] ❄️ Generated ICE Candidate, sending to Admin...");
            localSocket.emit("signal", {
              type: "ice-candidate",
              payload: e.candidate.toJSON(),
              sender: "client",
            } as SignalingMessage);
          }
        };

        // Track ICE Connection State for debugging NAT traversal
        localPc.oniceconnectionstatechange = () => {
          if (cancelled || !localPc) return;
          console.log(`[WebRTC Client] ICE Connection State: ${localPc.iceConnectionState}`);
        };

        localPc.onconnectionstatechange = () => {
          if (cancelled || !localPc) return;
          console.log(`[WebRTC Client] Connection state: ${localPc.connectionState}`);
          const s = localPc.connectionState;
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
        localSocket.on("signal", async (msg: SignalingMessage) => {
          if (cancelled || !localPc || msg.sender !== "admin") return;
          
          if (localPc.signalingState === "closed") return;

          if (msg.type === "answer" && localPc.signalingState === "have-local-offer") {
            try {
              await localPc.setRemoteDescription(new RTCSessionDescription(msg.payload));
              console.log("[WebRTC Client] Remote answer set successfully");
            } catch (err) {
              if (!cancelled) console.error("[WebRTC Client] Failed to set remote answer:", err);
            }
          } else if (msg.type === "ice-candidate" && localPc.remoteDescription) {
            try {
              console.log("[WebRTC Client] 🧊 Received ICE Candidate from Admin, adding...");
              await localPc.addIceCandidate(new RTCIceCandidate(msg.payload));
            } catch (err) {
              console.error("[WebRTC Client] Failed to add ICE candidate:", err);
            }
          }
        });

        // When signaling connects, create offer
        localSocket.on("connect", () => {
          if (cancelled) return;
          console.log("[WebRTC Client] Connected to signaling, joining room...");
          localSocket!.emit("join", { role: "client" });
        });

        // Admin requests an offer
        localSocket.on("request-offer", async () => {
          if (cancelled || !localPc) return;
          console.log("[WebRTC Client] Received request-offer from signaling");
          
          try {
            if (localPc.signalingState === "closed") return;
            const offer = await localPc.createOffer({ iceRestart: true });
            
            if (cancelled || localPc.signalingState === "closed") return;
            await localPc.setLocalDescription(offer);
            
            if (cancelled || localPc.signalingState === "closed") return;
            console.log("[WebRTC Client] Sending offer to admin...");
            localSocket!.emit("signal", {
              type: "offer",
              payload: offer,
              sender: "client",
            } as SignalingMessage);
          } catch (err) {
            if (!cancelled) console.error("[WebRTC Client] Failed to create offer:", err);
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
      console.log("[WebRTC Client] Cleaning up connection singleton...");
      cancelled = true;
      if (localPc) {
        localPc.close();
      }
      if (localSocket) {
        localSocket.disconnect();
      }
      if (localStream) {
        localStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [signalingUrl]);

  return state;
}
