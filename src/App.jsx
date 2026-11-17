import { useEffect, useRef, useState } from "react";
import "./App.css";
import {
  RnnoiseWorkletNode,
  loadRnnoise
} from "@sapphi-red/web-noise-suppressor";

import rnnoiseWorkletPath from "@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url";

import rnnoiseWasmPath from "@sapphi-red/web-noise-suppressor/rnnoise.wasm?url"; 
import rnnoiseWasmSimdPath from "@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url";

const SIGNALING_SERVER = "wss://low-bandwidth-video-chat.onrender.com";
const METERED_API_KEY = import.meta.env.VITE_METERED_API_KEY;

let cachedIceServers = null;

function App() {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  const localStreamRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const socketRef = useRef(null);
const audioContextRef = useRef(null);
const rnnoiseNodeRef = useRef(null);
const processedStreamRef = useRef(null);
  const pendingCandidatesRef = useRef([]);
  const recognitionRef = useRef(null);
  const recognitionActiveRef = useRef(false);

  const [cameraOn, setCameraOn] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [noiseCancellationOn, setNoiseCancellationOn] = useState(false);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState("Not connected");
  const [roomId, setRoomId] = useState("test123");
  const [networkSpeed, setNetworkSpeed] = useState("Checking...");
  const [captionLanguage, setCaptionLanguage] = useState("en-IN");
  const [captionsOn, setCaptionsOn] = useState(false);
  const [localCaption, setLocalCaption] = useState("");
  const [remoteCaption, setRemoteCaption] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState([]);

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
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      localStreamRef.current = stream;
      let rnnoiseReady = false;

      // RNNoise failure should not prevent a normal video call from starting.
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass || !AudioContextClass.prototype.audioWorklet) {
          throw new Error("AudioWorklet is not supported by this browser.");
        }

        const audioContext = new AudioContextClass();
        audioContextRef.current = audioContext;

        const rnnoiseWasmBinary = await loadRnnoise({
          url: rnnoiseWasmPath,
          simdUrl: rnnoiseWasmSimdPath,
        });

        await audioContext.audioWorklet.addModule(rnnoiseWorkletPath);

        const source = audioContext.createMediaStreamSource(stream);
        const rnnoiseNode = new RnnoiseWorkletNode(audioContext, {
          wasmBinary: rnnoiseWasmBinary,
          maxChannels: 1,
        });
        const destination = audioContext.createMediaStreamDestination();

        source.connect(rnnoiseNode);
        rnnoiseNode.connect(destination);

        const processedAudioTrack = destination.stream.getAudioTracks()[0];
        if (!processedAudioTrack) {
          throw new Error("RNNoise did not create an output audio track.");
        }

        rnnoiseNodeRef.current = rnnoiseNode;
        processedStreamRef.current = destination.stream;
        await audioContext.resume();
        rnnoiseReady = true;
      } catch (noiseError) {
        console.error("RNNoise initialization failed; using microphone audio:", noiseError);
        if (audioContextRef.current) {
          try {
            await audioContextRef.current.close();
          } catch (closeError) {
            console.debug("AudioContext close error:", closeError);
          }
          audioContextRef.current = null;
        }
        rnnoiseNodeRef.current = null;
        processedStreamRef.current = null;
      }

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      setNoiseCancellationOn(rnnoiseReady);
      setCameraOn(true);
      setStatus(rnnoiseReady ? "Camera ready - RNNoise enabled" : "Camera ready - standard audio");
    } catch (error) {
      console.error("Camera start error:", error);
      alert("Please allow camera and microphone permissions.");
    }
  };

  const toggleMute = () => {
    if (!localStreamRef.current) return;

    const audioTracks = localStreamRef.current.getAudioTracks();
    if (!audioTracks.length) return;

    const nextEnabled = !audioTracks[0].enabled;
    audioTracks.forEach((track) => {
      track.enabled = nextEnabled;
    });
    setMicOn(nextEnabled);
  };

  const toggleNoiseCancellation = async () => {
    const originalAudioTrack = localStreamRef.current?.getAudioTracks()[0];
    const processedAudioTrack = processedStreamRef.current?.getAudioTracks()[0];

    if (!originalAudioTrack || !processedAudioTrack) {
      alert("RNNoise is not available in this browser session. Restart the camera and check the console for errors.");
      return;
    }

    const nextEnabled = !noiseCancellationOn;
    const audioSender = peerConnectionRef.current
      ?.getSenders()
      .find((sender) => sender.track?.kind === "audio");

    try {
      if (audioSender) {
        await audioSender.replaceTrack(nextEnabled ? processedAudioTrack : originalAudioTrack);
      }
      setNoiseCancellationOn(nextEnabled);
      setStatus(nextEnabled ? "RNNoise noise cancellation ON" : "RNNoise noise cancellation OFF");
    } catch (error) {
      console.error("Unable to switch noise cancellation:", error);
      alert("Could not switch noise cancellation. Please try again.");
    }
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

  // Send original camera video and either RNNoise-processed or original microphone audio.
  if (localStreamRef.current) {
    localStreamRef.current.getVideoTracks().forEach((track) => {
      peer.addTrack(track, localStreamRef.current);
    });

    const originalAudioTrack = localStreamRef.current.getAudioTracks()[0];
    const processedAudioTrack = processedStreamRef.current?.getAudioTracks()[0];
    const outgoingAudioTrack = noiseCancellationOn && processedAudioTrack
      ? processedAudioTrack
      : originalAudioTrack;

    if (outgoingAudioTrack) {
      const audioStream = noiseCancellationOn && processedStreamRef.current
        ? processedStreamRef.current
        : localStreamRef.current;
      peer.addTrack(outgoingAudioTrack, audioStream);
    }
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
      alert("Please turn on your camera and microphone to continue.");
      return;
    }

    if (!roomId.trim()) {
      alert("Please enter a Room ID.");
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

      // Live captions and text chat are relayed by the existing room server.
      if (data.type === "live-caption") {
        setRemoteCaption(data.text || "");
        return;
      }

      if (data.type === "chat-message") {
        setChatMessages((previous) => [
          ...previous,
          { id: `${Date.now()}-${Math.random()}`, text: data.text || "", sender: "Other person", time: data.time || "" },
        ]);
        return;
      }


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
  // Live captions (browser speech recognition)
  // -----------------------------
  const stopCaptions = () => {
    recognitionActiveRef.current = false;
    setCaptionsOn(false);
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (error) { console.debug(error); }
      recognitionRef.current = null;
    }
    setLocalCaption("");
  };

  const startCaptions = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Live Captions require a recent version of Google Chrome or Microsoft Edge.");
      return;
    }
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      alert("Please join a room before starting Live Captions.");
      return;
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (error) { console.debug(error); }
    }

    const recognition = new SpeechRecognition();
    recognition.lang = captionLanguage;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let interim = "";
      const completed = [];
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0]?.transcript?.trim();
        if (!text) continue;
        if (result.isFinal) completed.push(text);
        else interim += `${text} `;
      }
      const liveText = [completed.join(" "), interim.trim()].filter(Boolean).join(" ").trim();
      if (liveText) {
        setLocalCaption(liveText);
        if (socketRef.current?.readyState === WebSocket.OPEN) {
          socketRef.current.send(JSON.stringify({
            type: "live-caption",
            text: liveText,
            isFinal: completed.length > 0 && !interim.trim(),
          }));
        }
      }
    };

    recognition.onerror = (event) => {
      console.warn("Caption recognition:", event.error);
      if (["not-allowed", "service-not-allowed", "audio-capture", "aborted"].includes(event.error)) {
        recognitionActiveRef.current = false;
        setCaptionsOn(false);
      }
    };

    recognition.onend = () => {
      if (recognitionActiveRef.current) {
        try { recognition.start(); } catch (error) { console.debug("Caption restart:", error); }
      } else {
        setCaptionsOn(false);
      }
    };

    recognitionRef.current = recognition;
    recognitionActiveRef.current = true;
    setCaptionsOn(true);
    try {
      recognition.start();
    } catch (error) {
      recognitionActiveRef.current = false;
      setCaptionsOn(false);
      console.error(error);
      alert("Unable to start captions. Please check your microphone permissions.");
    }
  };

  const sendChatMessage = () => {
    const text = chatInput.trim();
    if (!text) return;
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      alert("Please join a room before sending a message.");
      return;
    }
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    socketRef.current.send(JSON.stringify({ type: "chat-message", text, time }));
    setChatMessages((previous) => [
      ...previous,
      { id: `${Date.now()}-${Math.random()}`, text, sender: "You", time },
    ]);
    setChatInput("");
  };

  // -----------------------------
  // End Call
  // -----------------------------
  const endCall = async () => {
    stopCaptions();
    if (peerConnectionRef.current) {
      if (peerConnectionRef.current._networkMonitor) {
        clearInterval(peerConnectionRef.current._networkMonitor);
      }
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

    if (processedStreamRef.current) {
      processedStreamRef.current.getTracks().forEach((track) => track.stop());
      processedStreamRef.current = null;
    }

    if (rnnoiseNodeRef.current) {
      try {
        rnnoiseNodeRef.current.disconnect();
        rnnoiseNodeRef.current.destroy?.();
      } catch (error) {
        console.debug("RNNoise cleanup error:", error);
      }
      rnnoiseNodeRef.current = null;
    }

    if (audioContextRef.current) {
      try {
        await audioContextRef.current.close();
      } catch (error) {
        console.debug("AudioContext cleanup error:", error);
      }
      audioContextRef.current = null;
    }

    setNoiseCancellationOn(false);
    setMicOn(true);

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
      recognitionActiveRef.current = false;
      if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch (error) { console.debug(error); } }
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
      if (processedStreamRef.current) {
        processedStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (rnnoiseNodeRef.current) {
        try {
          rnnoiseNodeRef.current.disconnect();
          rnnoiseNodeRef.current.destroy?.();
        } catch (error) {
          console.debug("RNNoise unmount cleanup error:", error);
        }
      }
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close().catch((error) => console.debug(error));
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
              Waiting for the other participant…
            </div>
          )}
        </div>
      </div>

      <div className="controls">
      {cameraOn && (
        <>
          <button onClick={toggleMute}>
            {micOn ? "🎤 Mute" : "🔇 Unmute"}
          </button>
          <button onClick={toggleNoiseCancellation} disabled={!processedStreamRef.current}>
            {noiseCancellationOn ? "🟢 RNNoise ON" : "⚪ RNNoise OFF"}
          </button>
        </>
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
      <section className="caption-panel">
        <div className="panel-heading">
          <div>
            <h2>Live Captions</h2>
            <p>Your speech appears here in real time and is shared with the other participant.</p>
          </div>
          <div className="caption-actions">
            <label className="language-picker">
              <span>Speech recognition language</span>
              <select value={captionLanguage} onChange={(event) => setCaptionLanguage(event.target.value)} disabled={captionsOn}>
                <option value="en-IN">English & Hinglish (India)</option>
                <option value="hi-IN">Hindi (India)</option>
              </select>
            </label>
            {!captionsOn ? (
              <button className="primary-action" onClick={startCaptions}>🎙 Start Live Captions</button>
            ) : (
              <button className="stop-action" onClick={stopCaptions}>■ Stop Captions</button>
            )}
          </div>
        </div>
        <div className="caption-grid" aria-live="polite">
          <div className="caption-card">
            <span className="caption-label">YOUR CAPTIONS</span>
            <p>{localCaption || (captionsOn ? "Listening… Speak naturally." : "Your spoken words will appear here in real time.")}</p>
          </div>
          <div className="caption-card remote-caption">
            <span className="caption-label">PARTICIPANT CAPTIONS</span>
            <p>{remoteCaption || "The other participant’s live captions will appear here."}</p>
          </div>
        </div>
        <small className="caption-note">Speak naturally in English or Hinglish. For Hindi-only speech, select Hindi (India). Recognition accuracy may vary depending on your browser, microphone, network, and accent.</small>
      </section>

      <section className="chat-panel">
        <div className="panel-heading">
          <div>
            <h2>Live Text Chat</h2>
            <p>Send instant text messages while staying on your video call.</p>
          </div>
        </div>
        <div className="chat-history" aria-live="polite">
          {chatMessages.length === 0 ? <p className="empty-chat">No messages yet. Start the conversation!</p> : chatMessages.map((item) => (
            <div className={`chat-message ${item.sender === "You" ? "mine" : "theirs"}`} key={item.id}>
              <strong>{item.sender}</strong>
              <p>{item.text}</p>
              <small>{item.time}</small>
            </div>
          ))}
        </div>
        <form className="chat-compose" onSubmit={(event) => { event.preventDefault(); sendChatMessage(); }}>
          <input value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="Type your message here…" aria-label="Type a message" />
          <button type="submit" className="primary-action" disabled={!chatInput.trim()}>Send Message</button>
        </form>
      </section>
      <div className="credit">
  Designed & Developed by <strong>HaRdIk</strong>
</div>
    </div>
  );
}
export default App;