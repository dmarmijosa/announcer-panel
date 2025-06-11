import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { environment } from '@environments/environment';
import {
  Room,
  RoomEvent,
  RemoteParticipant,
  Participant,
} from 'livekit-client';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root',
})
export class LivekitService {
  private http = inject(HttpClient);
  public room?: Room;

  private getAuthHeaders(): HttpHeaders {
    const token = localStorage.getItem('access_token');
    return new HttpHeaders({
      Authorization: `Bearer ${token}`,
    });
  }

  // Pide un token de acceso a nuestro backend NestJS
  getToken(): Observable<string> {
    return this.http
      .post<{ token: string }>(
        `${environment.base_url}/livekit/token`,
        {},
        { headers: this.getAuthHeaders() }
      )
      .pipe(map((response) => response.token));
  }

  // Se conecta a la sala de LiveKit
  async connectToRoom(token: string): Promise<void> {
    this.room = new Room({
      adaptiveStream: true,
      dynacast: true,
    });

    const livekitUrl = environment.livekit_url; // ej: 'ws://localhost:7881'

    await this.room.connect(livekitUrl, token);
    console.log('Conectado a la sala de LiveKit:', this.room.name);
  }

  // Publica una pista de audio (el stream de nuestra mezcla) en la sala
  async publishAudio(stream: MediaStream): Promise<void> {
    if (!this.room) {
      console.error('No estás conectado a una sala.');
      return;
    }
    await this.room.localParticipant.publishTrack(stream.getAudioTracks()[0]);
    console.log('Stream de audio publicado.');
  }

  // Se desconecta de la sala
  disconnect(): void {
    if (this.room) {
      this.room.disconnect();
      console.log('Desconectado de la sala de LiveKit.');
      this.room = undefined;
    }
  }
}
