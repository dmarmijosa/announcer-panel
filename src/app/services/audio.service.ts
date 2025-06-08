import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { environment } from '@environments/environment';
import { Observable, tap } from 'rxjs';
export interface AudioFile {
  id: string;
  originalName: string;
  title: string;
  artist: string;
  filePath: string;
  uploadedAt: string;
}

@Injectable({
  providedIn: 'root',
})
export class AudioService {
  private http = inject(HttpClient);
  private readonly API_URL = `${environment.base_url}/audio`;
  // Un signal para mantener la lista de archivos de audio
  public audioFiles = signal<AudioFile[]>([]);

  private getAuthHeaders(): HttpHeaders {
    const token = localStorage.getItem('access_token');
    return new HttpHeaders({
      Authorization: `Bearer ${token}`,
    });
  }

  // Obtener todos los archivos de audio del backend
  loadFiles(): Observable<AudioFile[]> {
    return this.http
      .get<AudioFile[]>(this.API_URL, { headers: this.getAuthHeaders() })
      .pipe(tap((files) => this.audioFiles.set(files)));
  }

  // Subir un nuevo archivo de audio
  uploadFile(file: File): Observable<AudioFile> {
    const formData = new FormData();
    formData.append('file', file);

    return this.http
      .post<AudioFile>(`${this.API_URL}/upload`, formData, {
        headers: this.getAuthHeaders(),
      })
      .pipe(tap(() => this.loadFiles().subscribe()));
  }

  // ---- NUEVO MÉTODO ----
  // Actualizar un archivo de audio
  updateFile(
    id: string,
    data: { title?: string; artist?: string }
  ): Observable<AudioFile> {
    return this.http
      .patch<AudioFile>(`${this.API_URL}/${id}`, data, {
        headers: this.getAuthHeaders(),
      })
      .pipe(
        tap((updatedFile) => {
          // Actualizamos el signal localmente para no tener que recargar toda la lista
          this.audioFiles.update((files) =>
            files.map((file) => (file.id === id ? updatedFile : file))
          );
        })
      );
  }

  // Borrar un archivo de audio
  deleteFile(id: string): Observable<void> {
    return this.http
      .delete<void>(`${this.API_URL}/${id}`, { headers: this.getAuthHeaders() })
      .pipe(tap(() => this.loadFiles().subscribe()));
  }
}
