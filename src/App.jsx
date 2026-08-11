import { useEffect, useRef, useState } from "react";
import "./App.css";

const SIGNALING_SERVER = "wss://low-bandwidth-video-chat.onrender.com";
const METERED_API_KEY = import.meta.env.VITE_METERED_API_KEY;

let cachedIceServers = null;

function App() {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  const localStreamRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const socketRef = useRef(null);

  const pendingCandidatesRef = useRef([]);

  const [cameraOn, setCameraOn] = useState(false);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState("Not connected");
  const [roomId, setRoomId] = useState("test123");

  // -----------------------------
  // Start Camera
  // -----------------------------
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 360 },
          frameRate: { ideal: 15, max: 20 },
        },
        audio: true,
      });

      localStreamRef.current = stream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      setCameraOn(true);
      setStatus("Camera ready");
    } catch (error) {
      console.error(error);
      alert("Camera aur microphone ki permission allow karo.");
    }
  };

  // -----------------------------
  // Create WebRTC Connection
  // -----------------------------
 const createPeerConnection = async () => {
  if (peerConnectionRef.current) {
    return peerConnectionRef.current;
  }

  // Metered TURN credentials / ICE servers
  if (!cachedIceServers) {
    try {
      const response = await fetch(
        `https://lowbandwidthvideochat.metered.live/api/v1/turn/credentials?apiKey=${METERED_API_KEY}`
      );

      if (!response.ok) {
        throw new Error(
          `TURN credentials fetch failed: ${response.status}`
        );
      }

      cachedIceServers = await response.json();

      console.log("Metered ICE servers received:", cachedIceServers);
    } catch (error) {
      console.error("TURN server error:", error);

      // TURN fail ho jaye to Google STUN se fallback
      cachedIceServers = [
        {
          urls: "stun:stun.l.google.com:19302",
        },
      ];
    }
  }

  const peer = new RTCPeerConnection({
    iceServers: cachedIceServers,
  });

  // Local tracks add karo
  if (localStreamRef.current) {
    localStreamRef.current.getTracks().forEach((track) => {
      peer.addTrack(track, localStreamRef.current);
    });
  }

  // Remote video receive
  peer.ontrack = (event) => {
    console.log("Remote stream received");

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = event.streams[0];
    }

    setConnected(true);
    setStatus("Connected");
  };

  // ICE candidates
  peer.onicecandidate = (event) => {
    if (event.candidate && socketRef.current) {
      socketRef.current.send(
        JSON.stringify({
          type: "ice-candidate",
          candidate: event.candidate,
        })
      );
    }
  };

  // Connection status
  peer.onconnectionstatechange = () => {
    console.log("WebRTC:", peer.connectionState);

    if (peer.connectionState === "connected") {
      setConnected(true);
      setStatus("Connected");
    }

    if (
      peer.connectionState === "disconnected" ||
      peer.connectionState === "failed" ||
      peer.connectionState === "closed"
    ) {
      setConnected(false);
      setStatus("Disconnected");
    }
  };

  peerConnectionRef.current = peer;

  return peer;
};

  // -----------------------------
  // Connect to Room
  // -----------------------------
  const joinRoom = () => {
    if (!cameraOn) {
      alert("Pehle Start Camera dabao.");
      return;
    }

    if (!roomId.trim()) {
      alert("Room ID enter karo.");
      return;
    }

    if (
      socketRef.current &&
      socketRef.current.readyState === WebSocket.OPEN
    ) {
      socketRef.current.send(
        JSON.stringify({
          type: "join",
          room: roomId.trim(),
        })
      );

      setStatus("Joined room");
      return;
    }

    const socket = new WebSocket(SIGNALING_SERVER);

    socketRef.current = socket;

    socket.onopen = () => {
      console.log("Connected to signaling server");

      socket.send(
        JSON.stringify({
          type: "join",
          room: roomId.trim(),
        })
      );

      setStatus("Joined room - waiting...");
    };

    socket.onmessage = async (event) => {
      const data = JSON.parse(event.data);

      console.log("Signaling message:", data.type);

      // -------------------------
      // Someone joined
      // -------------------------
      if (data.type === "user-joined") {
        console.log("Other user joined");

        const peer = await createPeerConnection();

        const offer = await peer.createOffer();

        await peer.setLocalDescription(offer);

        socket.send(
          JSON.stringify({
            type: "offer",
            offer,
          })
        );

        setStatus("Calling other person...");
      }

      // -------------------------
      // Receive Offer
      // -------------------------
      if (data.type === "offer") {
        const peer = awaitcreatePeerConnection();

        await peer.setRemoteDescription(
          new RTCSessionDescription(data.offer)
        );

        // Pending ICE candidates add karo
        for (const candidate of pendingCandidatesRef.current) {
          await peer.addIceCandidate(candidate);
        }

        pendingCandidatesRef.current = [];

        const answer = await peer.createAnswer();

        await peer.setLocalDescription(answer);

        socket.send(
          JSON.stringify({
            type: "answer",
            answer,
          })
        );

        setStatus("Answer sent");
      }

      // -------------------------
      // Receive Answer
      // -------------------------
      if (data.type === "answer") {
        const peer = peerConnectionRef.current;

        if (!peer) return;

        await peer.setRemoteDescription(
          new RTCSessionDescription(data.answer)
        );

        // Pending ICE candidates add karo
        for (const candidate of pendingCandidatesRef.current) {
          await peer.addIceCandidate(candidate);
        }

        pendingCandidatesRef.current = [];

        setStatus("Connecting...");
      }

      // -------------------------
      // ICE Candidate
      // -------------------------
      if (data.type === "ice-candidate") {
        const peer = peerConnectionRef.current;

        if (!peer) return;

        const candidate = new RTCIceCandidate(
          data.candidate
        );

        if (peer.remoteDescription) {
          await peer.addIceCandidate(candidate);
        } else {
          pendingCandidatesRef.current.push(candidate);
        }
      }
    };

    socket.onerror = (error) => {
      console.error("WebSocket error:", error);
      setStatus("Signaling server error");
    };

    socket.onclose = () => {
      console.log("Signaling disconnected");
    };
  };

  // -----------------------------
  // End Call
  // -----------------------------
  const endCall = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current
        .getTracks()
        .forEach((track) => track.stop());

      localStreamRef.current = null;
    }

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    pendingCandidatesRef.current = [];

    setCameraOn(false);
    setConnected(false);
    setStatus("Call ended");
  };

  useEffect(() => {
    return () => {
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }

      if (socketRef.current) {
        socketRef.current.close();
      }

      if (localStreamRef.current) {
        localStreamRef.current
          .getTracks()
          .forEach((track) => track.stop());
      }
    };
  }, []);

  return (
    <div className="app">
      <h1>Low Bandwidth Video Chat</h1>

      <div className="room-section">
        <input
          type="text"
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
          placeholder="Room ID"
        />

        <button onClick={joinRoom}>
          🔗 Join Room
        </button>
      </div>

      <div className="status">
        Status: <strong>{status}</strong>
      </div>

      <div className="videos">
        <div className="video-box">
          <span>You</span>

          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
          />
        </div>

        <div className="video-box">
          <span>Other Person</span>

          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
          />

          {!connected && (
            <div className="waiting">
              Waiting for other person...
            </div>
          )}
        </div>
      </div>

      <div className="controls">
        {!cameraOn ? (
          <button onClick={startCamera}>
            📹 Start Camera
          </button>
        ) : (
          <button onClick={endCall}>
            📞 End Call
          </button>
        )}
      </div>
      <div className="credit">
  Designed & Developed by <strong>HaRdIk</strong>
</div>
    </div>
  );
}

export default App;