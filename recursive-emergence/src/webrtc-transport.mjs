function requireWebRTC() {
  if (typeof RTCPeerConnection === 'undefined') {
    throw new Error('RTCPeerConnection is unavailable in this runtime. Use this transport in the browser/webview or inject another transport into PeerMeshBridge.');
  }
}

function waitForIce(pc) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const onState = () => {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', onState);
        resolve();
      }
    };
    pc.addEventListener('icegatheringstatechange', onState);
  });
}

export class WebRTCPeerTransport {
  constructor({ initiator = false, rtcConfig = { iceServers: [] }, label = 'stellar-mesh' } = {}) {
    requireWebRTC();
    this.pc = new RTCPeerConnection(rtcConfig);
    this.channel = null;
    this.onmessage = null;
    this.onopen = null;
    this.onclose = null;
    this.pc.ondatachannel = (event) => this._bind(event.channel);
    if (initiator) this._bind(this.pc.createDataChannel(label, { ordered: true }));
  }

  _bind(channel) {
    this.channel = channel;
    channel.onopen = () => this.onopen?.();
    channel.onclose = () => this.onclose?.();
    channel.onmessage = (event) => {
      let data = event.data;
      try { data = JSON.parse(data); } catch {}
      this.onmessage?.({ data });
    };
  }

  async createOffer() {
    if (!this.channel) this._bind(this.pc.createDataChannel('stellar-mesh', { ordered: true }));
    await this.pc.setLocalDescription(await this.pc.createOffer());
    await waitForIce(this.pc);
    return JSON.stringify(this.pc.localDescription);
  }

  async acceptOffer(serializedOffer) {
    const offer = typeof serializedOffer === 'string' ? JSON.parse(serializedOffer) : serializedOffer;
    await this.pc.setRemoteDescription(offer);
    await this.pc.setLocalDescription(await this.pc.createAnswer());
    await waitForIce(this.pc);
    return JSON.stringify(this.pc.localDescription);
  }

  async acceptAnswer(serializedAnswer) {
    const answer = typeof serializedAnswer === 'string' ? JSON.parse(serializedAnswer) : serializedAnswer;
    await this.pc.setRemoteDescription(answer);
    return true;
  }

  send(message) {
    if (!this.channel || this.channel.readyState !== 'open') throw new Error('WebRTC data channel is not open');
    this.channel.send(typeof message === 'string' ? message : JSON.stringify(message));
  }

  close() {
    try { this.channel?.close(); } catch {}
    try { this.pc?.close(); } catch {}
  }
}
