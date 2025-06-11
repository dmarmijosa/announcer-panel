import { Injectable, signal, OnDestroy, inject, effect } from '@angular/core';
import { AudioFile, AudioService } from './audio.service';
import { environment } from '@environments/environment';
import { LivekitService } from './livekit.service';

// Claves para guardar el estado en localStorage
const STORAGE_KEYS = {
  TRACK_ID: 'radio_player_track_id',
  TRACK_TIME: 'radio_player_track_time',
  MIC_STATUS: 'radio_player_mic_status',
};

@Injectable({
  providedIn: 'root',
})
export class PlayerService implements OnDestroy {
  // Core de la Web Audio API
  private audioContext: AudioContext;
  private musicSource: AudioBufferSourceNode | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private musicGainNode: GainNode;
  private analyserNode: AnalyserNode;
  private dataArray: Uint8Array;

  private broadcastDestination: MediaStreamAudioDestinationNode;
  public isBroadcasting = signal(false);

  private currentAudioBuffer: AudioBuffer | null = null;

  // Gestión precisa del tiempo
  private playbackStartTime = 0;
  private playbackPausedAt = 0;
  private animationFrameId: number | null = null;

  private audioService = inject(AudioService);
  private livekitService = inject(LivekitService);
  // --- Signals para la UI ---
  public state = signal<'playing' | 'paused' | 'stopped'>('stopped');
  public currentlyPlaying = signal<AudioFile | null>(null);
  public currentTime = signal(0);
  public duration = signal(0);
  public isMicActive = signal(false);
  public isEndingSoon = signal(false);

  public unfinishedSession = signal<{ trackId: string; time: number } | null>(
    null
  );

  constructor() {
    this.audioContext = new AudioContext();
    this.musicGainNode = this.audioContext.createGain();
    this.analyserNode = this.audioContext.createAnalyser();

    this.broadcastDestination =
      this.audioContext.createMediaStreamDestination();

    this.analyserNode.fftSize = 256;
    const bufferLength = this.analyserNode.frequencyBinCount;
    this.dataArray = new Uint8Array(bufferLength);

    this.musicGainNode.connect(this.audioContext.destination);

    this.musicGainNode.connect(this.broadcastDestination);

    this.loadStateFromStorage();

    effect(() => {
      this.saveStateToStorage();
    });
  }

  // --- Métodos de transmisión en vivo ---
  async startBroadcast(): Promise<void> {
    if (this.isBroadcasting()) return;

    this.livekitService.getToken().subscribe(async (token) => {
      try {
        await this.livekitService.connectToRoom(token);
        // Obtenemos el stream de la mezcla final
        const broadcastStream = this.broadcastDestination.stream;
        await this.livekitService.publishAudio(broadcastStream);
        this.isBroadcasting.set(true);
      } catch (error) {
        console.error('Error al iniciar la transmisión:', error);
      }
    });
  }

  stopBroadcast(): void {
    this.livekitService.disconnect();
    this.isBroadcasting.set(false);
  }

  // --- MÉTODOS PÚBLICOS DE CONTROL ---

  async handlePlay(track: AudioFile): Promise<void> {
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    const isSameTrack = this.currentlyPlaying()?.id === track.id;

    if (isSameTrack) {
      if (this.state() === 'playing') this.pause();
      else if (this.state() === 'paused') this.resume();
      else await this.startPlayback(track, 0);
    } else {
      await this.startPlayback(track, 0);
    }
  }

  pause(): void {
    if (this.state() !== 'playing' || !this.musicSource) return;
    this.stopUiLoop();
    this.playbackPausedAt = this.currentTime();
    this.musicSource.onended = null;
    this.musicSource.stop();
    this.state.set('paused');
  }

  resume(): void {
    if (
      this.state() !== 'paused' ||
      !this.currentlyPlaying() ||
      !this.currentAudioBuffer
    )
      return;
    this.createAndStartSource(this.playbackPausedAt);
    this.state.set('playing');
  }

  stop(isInternal: boolean = false): void {
    this.stopUiLoop();
    if (this.musicSource) {
      this.musicSource.onended = null;
      this.musicSource.stop();
      this.musicSource = null;
    }
    if (!isInternal) {
      this.state.set('stopped');
      this.currentlyPlaying.set(null);
      this.currentTime.set(0);
      this.duration.set(0);
      this.playbackPausedAt = 0;
      this.currentAudioBuffer = null;
    }
  }

  seek(time: number): void {
    if (
      !this.currentlyPlaying() ||
      !this.currentAudioBuffer ||
      time < 0 ||
      time > this.duration()
    )
      return;

    const wasPlaying = this.state() === 'playing';
    this.stop(true);
    this.createAndStartSource(time);

    if (!wasPlaying) {
      this.pause();
    }
  }

  playNext(): void {
    const currentPlaylist = this.audioService.audioFiles();
    const currentTrackId = this.currentlyPlaying()?.id;
    if (!currentTrackId || currentPlaylist.length === 0) {
      this.stop();
      return;
    }
    const currentIndex = currentPlaylist.findIndex(
      (t) => t.id === currentTrackId
    );
    let nextIndex = currentIndex + 1;
    if (nextIndex >= currentPlaylist.length) nextIndex = 0;

    const nextTrack = currentPlaylist[nextIndex];
    if (nextTrack) this.startPlayback(nextTrack, 0);
  }

  async toggleMic(): Promise<void> {
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
    if (this.isMicActive()) {
      this.micSource?.disconnect();
      this.micSource = null;
      this.isMicActive.set(false);
      if (this.state() === 'stopped') this.stopUiLoop();
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        this.micSource = this.audioContext.createMediaStreamSource(stream);
        this.micSource.connect(this.analyserNode);
        this.micSource.connect(this.audioContext.destination);
        this.isMicActive.set(true);
        this.startUiLoop();
      } catch (err) {
        console.error('Error al acceder al micrófono:', err);
      }
    }
  }

  async resumeSession(): Promise<void> {
    const session = this.unfinishedSession();
    if (!session) return;

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    const trackToResume = this.audioService
      .audioFiles()
      .find((t) => t.id === session.trackId);
    if (trackToResume) {
      await this.loadTrackForResume(trackToResume, session.time);
    }
    this.unfinishedSession.set(null);
  }

  private async startPlayback(
    track: AudioFile,
    startTime: number
  ): Promise<void> {
    this.stop(true);
    await this.loadTrackForResume(track, startTime);
    this.resume();
  }

  private async loadTrackForResume(
    track: AudioFile,
    startTime: number
  ): Promise<void> {
    try {
      const response = await fetch(
        `${environment.base_url}/uploads/${track.filePath}`
      );
      const arrayBuffer = await response.arrayBuffer();
      this.currentAudioBuffer = await this.audioContext.decodeAudioData(
        arrayBuffer
      );

      this.duration.set(this.currentAudioBuffer.duration);
      this.currentTime.set(startTime);
      this.playbackPausedAt = startTime;
      this.currentlyPlaying.set(track);
      this.state.set('paused');
    } catch (error) {
      console.error('Error al cargar la pista:', error);
      this.stop();
    }
  }

  private createAndStartSource(startTime: number): void {
    if (!this.currentAudioBuffer) return;
    this.musicSource = this.audioContext.createBufferSource();
    this.musicSource.buffer = this.currentAudioBuffer;
    this.musicSource.connect(this.musicGainNode);

    this.playbackPausedAt = startTime;
    this.playbackStartTime = this.audioContext.currentTime;
    this.musicSource.start(0, startTime);
    this.startUiLoop();

    this.musicSource.onended = () => {
      if (this.state() === 'playing') this.playNext();
    };
  }

  private startUiLoop(): void {
    this.stopUiLoop();
    const loop = () => {
      if (this.state() === 'stopped' && !this.isMicActive()) {
        this.stopUiLoop();
        return;
      }
      if (this.state() === 'playing') {
        const elapsedTime =
          this.audioContext.currentTime - this.playbackStartTime;
        this.currentTime.set(this.playbackPausedAt + elapsedTime);
      }
      if (this.isMicActive()) {
        this.analyserNode.getByteFrequencyData(this.dataArray);
        const average =
          this.dataArray.reduce((sum, value) => sum + value, 0) /
          this.dataArray.length;
        this.musicGainNode.gain.setTargetAtTime(
          average > 10 ? 0.1 : 1.0,
          this.audioContext.currentTime,
          0.1
        );
      } else {
        this.musicGainNode.gain.setTargetAtTime(
          1.0,
          this.audioContext.currentTime,
          0.5
        );
      }
      const timeLeft = this.duration() - this.currentTime();
      this.isEndingSoon.set(timeLeft <= 90 && this.state() === 'playing');
      this.animationFrameId = requestAnimationFrame(loop);
    };
    loop();
  }

  private stopUiLoop(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private loadStateFromStorage(): void {
    if (typeof window === 'undefined') return;
    const trackId = localStorage.getItem(STORAGE_KEYS.TRACK_ID);
    const time = localStorage.getItem(STORAGE_KEYS.TRACK_TIME);
    this.isMicActive.set(
      localStorage.getItem(STORAGE_KEYS.MIC_STATUS) === 'true'
    );
    if (trackId && time) {
      this.unfinishedSession.set({ trackId, time: parseFloat(time) });
    }
  }

  private saveStateToStorage(): void {
    if (typeof window === 'undefined') return;
    const track = this.currentlyPlaying();
    if (track && this.state() !== 'stopped') {
      localStorage.setItem(STORAGE_KEYS.TRACK_ID, track.id);
      localStorage.setItem(
        STORAGE_KEYS.TRACK_TIME,
        this.currentTime().toString()
      );
    } else {
      localStorage.removeItem(STORAGE_KEYS.TRACK_ID);
      localStorage.removeItem(STORAGE_KEYS.TRACK_TIME);
    }
    localStorage.setItem(
      STORAGE_KEYS.MIC_STATUS,
      this.isMicActive().toString()
    );
  }

  ngOnDestroy(): void {
    this.stop();
    this.audioContext.close();
  }
}
