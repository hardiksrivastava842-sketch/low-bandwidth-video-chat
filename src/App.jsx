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
  const [micOn, setMicOn] = useState(true);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState("Not connected");
  const [roomId, setRoomId] = useState("test123");
  const [networkSpeed, setNetworkSpeed] = useState("Checking...");

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
  const toggleMute = () => {
  if (!localStreamRef.current) return;

  const audioTracks = localStreamRef.current.getAudioTracks();

  audioTracks.forEach((track) => {
    track.enabled = !track.enabled;
  });

  setMicOn(audioTracks.some((track) => track.enabled));
};

  // -----------------------------
  // Create WebRTC Connection
  // -----------------------------
 const createPeerConnection = async () => {
  if (peerConnectionRef.current) {
    return peerConnectionRef.current;
  }
  const startNetworkMonitor = (peer) => {
  const interval = setInterval(async () => {
    if (!peer || peer.connectionState !== "connected") {
      setNetworkSpeed("Not connected");
      return;
    }

    try {
      const stats = await peer.getStats();

      let inboundBytes = 0;
      let timestamp = 0;

      stats.forEach((report) => {
        if (
          report.type === "inbound-rtp" &&
          report.kind === "video"
        ) {
          inboundBytes = report.bytesReceived || 0;
          timestamp = report.timestamp || 0;
        }
      });

      if (!peer._lastNetworkStats) {
        peer._lastNetworkStats = {
          bytes: inboundBytes,
          timestamp,
        };
        return;
      }

      const previous = peer._lastNetworkStats;

      const bytesDiff = inboundBytes - previous.bytes;
      const timeDiff = (timestamp - previous.timestamp) / 1000;

      if (timeDiff > 0 && bytesDiff >= 0) {
        const bitsPerSecond = (bytesDiff * 8) / timeDiff;

        if (bitsPerSecond >= 1000000) {
          setNetworkSpeed(
            `${(bitsPerSecond / 1000000).toFixed(1)} Mbps`
          );
        } else {
          setNetworkSpeed(
            `${Math.round(bitsPerSecond / 1000)} Kbps`
          );
        }
      }

      peer._lastNetworkStats = {
        bytes: inboundBytes,
        timestamp,
      };
    } catch (error) {
      console.error("Network stats error:", error);
    }
  }, 2000);

  peer._networkMonitor = interval;
};

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
  startNetworkMonitor(peer);
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
  const generateRoomId = () => {
  const newRoomId = Math.random().toString(36).substring(2, 8).toUpperCase();

  setRoomId(newRoomId);

  // URL me room ID bhi automatically set ho jayegi
  window.history.replaceState(
    {},
    "",
    `${window.location.pathname}?room=${newRoomId}`
  );

  setStatus("Room ID generated");
};

const copyRoomLink = async () => {
  if (!roomId.trim()) {
    alert("Please enter or generate a Room ID first.");
    return;
  }

  const roomLink = `${window.location.origin}${window.location.pathname}?room=${roomId.trim()}`;

  try {
    await navigator.clipboard.writeText(roomLink);
    setStatus("Room link copied");
  } catch (error) {
    console.error(error);
    alert("Unable to copy the room link.");
  }
};
  const joinRoom = () => {
    if (!cameraOn) {
      alert("Please enable your camera and microphone to continue.");
      return;
    }

    if (!roomId.trim()) {
      alert("Enter room ID.");
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

  // Already negotiation chal rahi hai to dobara offer mat banao
  if (peerConnectionRef.current) {
    console.log("Peer connection already exists, ignoring duplicate join");
    return;
  }

  const peer = await createPeerConnection();

  if (peer.signalingState !== "stable") {
  console.log("Ignoring duplicate offer:", peer.signalingState);
  return;
}
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
        const peer = await createPeerConnection();

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

  // Answer sirf local offer ke baad accept hoga
  if (peer.signalingState !== "have-local-offer") {
    console.log(
      "Ignoring duplicate answer:",
      peer.signalingState
    );
    return;
  }

  await peer.setRemoteDescription(
    new RTCSessionDescription(data.answer)
  );

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
  const params = new URLSearchParams(window.location.search);
  const roomFromUrl = params.get("room");

  if (roomFromUrl) {
    setRoomId(roomFromUrl);
  }
}, []);

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
    placeholder="Enter Room ID"
  />

  <button onClick={generateRoomId}>
    🎲 Generate Room ID
  </button>

  <button onClick={copyRoomLink}>
    📋 Copy Link
  </button>

  <button onClick={joinRoom}>
    🔗 Join Room
  </button>
</div>

      <div className="status">
        Status: <strong>{status}</strong>
      </div>
<div className="network-speed">
  📶 Network: <strong>{networkSpeed}</strong>
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
      {cameraOn && (
  <button onClick={toggleMute}>
    {micOn ? "🎤 Mute" : "🔇 Unmute"}
  </button>
)}
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