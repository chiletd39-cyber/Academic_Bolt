import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

/**
 * Shared live-connection manager for phone-camera broadcasting.
 * WebRTC mesh over a Supabase Realtime broadcast channel (`bcast:<sessionId>`).
 * Phones publish; viewers request streams. All messages are client-id targeted.
 */

export type SignalKind = 'want' | 'offer' | 'answer' | 'ice' | 'bye';

export interface SignalMessage {
  from: string;
  to?: string;
  kind: SignalKind;
  payload?: unknown;
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
];

export class BroadcastSignaling {
  readonly clientId: string = crypto.randomUUID();
  private channel: RealtimeChannel | null = null;

  constructor(
    private readonly sessionId: string,
    private readonly onSignal: (m: SignalMessage) => void,
  ) {}

  connect(): void {
    this.channel = supabase.channel(`bcast:${this.sessionId}`, {
      config: { broadcast: { self: false } },
    });
    this.channel.on('broadcast', { event: 'signal' }, ({ payload }) => {
      const m = payload as SignalMessage;
      if (!m || typeof m !== 'object' || m.from === this.clientId) return;
      if (m.to && m.to !== this.clientId) return;
      this.onSignal(m);
    });
    this.channel.subscribe();
  }

  send(msg: Omit<SignalMessage, 'from'>): void {
    if (!this.channel) return;
    this.channel.send({
      type: 'broadcast',
      event: 'signal',
      payload: { ...msg, from: this.clientId } satisfies SignalMessage,
    });
  }

  close(): void {
    if (this.channel) {
      supabase.removeChannel(this.channel);
      this.channel = null;
    }
  }
}

/** Phone side: answers viewer 'want' requests with WebRTC offers. */
export class PhonePublisher {
  private peers = new Map<string, RTCPeerConnection>();

  constructor(
    private readonly signaling: BroadcastSignaling,
    private readonly stream: MediaStream,
    private readonly onPeerCount?: (n: number) => void,
  ) {}

  readonly handleSignal = (m: SignalMessage): void => {
    if (m.kind === 'want') void this.createOffer(m.from);
    else if (m.kind === 'answer') void this.applyAnswer(m);
    else if (m.kind === 'ice') void this.applyIce(m);
    else if (m.kind === 'bye') this.dropPeer(m.from);
  };

  private async createOffer(viewerId: string): Promise<void> {
    this.dropPeer(viewerId);
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.peers.set(viewerId, pc);
    this.onPeerCount?.(this.peers.size);
    for (const track of this.stream.getTracks()) pc.addTrack(track, this.stream);
    pc.onicecandidate = (e) => {
      if (e.candidate) this.signaling.send({ kind: 'ice', to: viewerId, payload: e.candidate.toJSON() });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') this.dropPeer(viewerId);
    };
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.signaling.send({ kind: 'offer', to: viewerId, payload: pc.localDescription });
    } catch {
      this.dropPeer(viewerId);
    }
  }

  private async applyAnswer(m: SignalMessage): Promise<void> {
    const pc = this.peers.get(m.from);
    if (!pc || !m.payload) return;
    try {
      await pc.setRemoteDescription(m.payload as RTCSessionDescriptionInit);
    } catch {
      this.dropPeer(m.from);
    }
  }

  private async applyIce(m: SignalMessage): Promise<void> {
    const pc = this.peers.get(m.from);
    if (!pc || !m.payload) return;
    try {
      await pc.addIceCandidate(m.payload as RTCIceCandidateInit);
    } catch {
      /* non-fatal */
    }
  }

  private dropPeer(id: string): void {
    const pc = this.peers.get(id);
    if (pc) {
      try { pc.close(); } catch { /* ignore */ }
      this.peers.delete(id);
      this.onPeerCount?.(this.peers.size);
    }
  }

  destroy(): void {
    for (const id of Array.from(this.peers.keys())) this.dropPeer(id);
  }
}

/** Viewer side: requests streams and exposes them as they arrive. */
export class StreamViewer {
  private peers = new Map<string, RTCPeerConnection>();

  constructor(
    private readonly signaling: BroadcastSignaling,
    private readonly onStream: (publisherId: string, stream: MediaStream | null) => void,
  ) {}

  readonly handleSignal = (m: SignalMessage): void => {
    if (m.kind === 'offer') void this.acceptOffer(m);
    else if (m.kind === 'ice') void this.applyIce(m);
    else if (m.kind === 'bye') this.dropPeer(m.from);
  };

  requestStreams(): void {
    this.signaling.send({ kind: 'want' });
  }

  private async acceptOffer(m: SignalMessage): Promise<void> {
    this.dropPeer(m.from);
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.peers.set(m.from, pc);
    pc.onicecandidate = (e) => {
      if (e.candidate) this.signaling.send({ kind: 'ice', to: m.from, payload: e.candidate.toJSON() });
    };
    pc.ontrack = (e) => {
      const [stream] = e.streams;
      if (stream) this.onStream(m.from, stream);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.dropPeer(m.from);
        this.onStream(m.from, null);
      }
    };
    try {
      await pc.setRemoteDescription(m.payload as RTCSessionDescriptionInit);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.signaling.send({ kind: 'answer', to: m.from, payload: pc.localDescription });
    } catch {
      this.dropPeer(m.from);
    }
  }

  private async applyIce(m: SignalMessage): Promise<void> {
    const pc = this.peers.get(m.from);
    if (!pc || !m.payload) return;
    try {
      await pc.addIceCandidate(m.payload as RTCIceCandidateInit);
    } catch {
      /* non-fatal */
    }
  }

  private dropPeer(id: string): void {
    const pc = this.peers.get(id);
    if (pc) {
      try { pc.close(); } catch { /* ignore */ }
      this.peers.delete(id);
    }
  }

  destroy(): void {
    for (const id of Array.from(this.peers.keys())) {
      this.dropPeer(id);
      this.onStream(id, null);
    }
  }
}
