import { Injectable, signal } from '@angular/core';
import { environment } from '@environments/environment';
import { AudioFile } from './audio.service';

@Injectable({
  providedIn: 'root',
})
export class PlayerService {
  private audioContext: AudioContext;
  private audioSource: AudioBufferSourceNode | null = null;
  private readonly API_URL = environment.base_url;

  // Signals para el estado del reproductor
  public isPlaying = signal(false);
  public currentlyPlaying = signal<AudioFile | null>(null);

  constructor() {
    this.audioContext = new AudioContext();
  }

  async play(track: AudioFile): Promise<void> {
    if (this.isPlaying()) {
      this.stop();
    }

    // --- NOTA IMPORTANTE ---
    // Para que esto funcione, nuestro backend necesita servir los archivos.
    // Asegúrate de que tu backend NestJS esté configurado para servir
    // archivos estáticos desde la carpeta 'uploads'.
    const response = await fetch(`${this.API_URL}/uploads/${track.filePath}`);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

    this.audioSource = this.audioContext.createBufferSource();
    this.audioSource.buffer = audioBuffer;
    this.audioSource.connect(this.audioContext.destination);
    this.audioSource.start();

    this.audioSource.onended = () => {
      this.isPlaying.set(false);
      this.currentlyPlaying.set(null);
    };

    this.isPlaying.set(true);
    this.currentlyPlaying.set(track);
  }

  stop(): void {
    if (this.audioSource) {
      this.audioSource.onended = null; // Evita que se dispare el onended al parar manualmente
      this.audioSource.stop();
      this.audioSource = null;
    }
    this.isPlaying.set(false);
    this.currentlyPlaying.set(null);
  }
}
