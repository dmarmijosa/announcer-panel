import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import {
  FormBuilder,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { AudioFile, AudioService } from 'src/app/services/audio.service';
import { PlayerService } from 'src/app/services/player.service';

@Component({
  selector: 'app-audio-library',
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './audio-library.component.html',
})
export class AudioLibraryComponent {
  public audioService = inject(AudioService);
  public playerService = inject(PlayerService);
  private fb = inject(FormBuilder);

  public isLoading = signal(true);
  public uploadError = signal<string | null>(null);
  public editingTrack = signal<AudioFile | null>(null);

  public editForm = this.fb.group({
    title: ['', Validators.required],
    artist: [''],
  });

  ngOnInit(): void {
    this.audioService.loadFiles().subscribe({
      next: () => {
        this.isLoading.set(false);
        if (this.playerService.unfinishedSession()) {
          // El usuario puede hacer clic en un botón para reanudar.
          // Por ahora, lo hacemos con un confirm simple.
          if (
            confirm(
              'Hemos encontrado una sesión de radio sin terminar. ¿Deseas reanudarla?'
            )
          ) {
            // ---- ¡AQUÍ ESTÁ LA CORRECCIÓN! ----
            this.playerService.resumeSession();
          } else {
            this.playerService.unfinishedSession.set(null);
          }
        }
      },
      error: (err) => {
        console.error('Error al cargar la biblioteca', err);
        this.isLoading.set(false);
      },
    });
  }

  handlePlay(track: AudioFile): void {
    this.playerService.handlePlay(track);
  }

  seek(event: MouseEvent): void {
    const progressBar = event.currentTarget as HTMLProgressElement;
    const clickPosition = event.offsetX;
    const progressBarWidth = progressBar.offsetWidth;
    const seekRatio = clickPosition / progressBarWidth;
    const seekTime = this.playerService.duration() * seekRatio;
    this.playerService.seek(seekTime);
  }

  toggleMic(): void {
    this.playerService.toggleMic();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      this.isLoading.set(true);
      this.uploadError.set(null);
      this.audioService.uploadFile(file).subscribe({
        next: () => this.isLoading.set(false),
        error: (err) => {
          this.isLoading.set(false);
          this.uploadError.set(
            err.error.message || 'Error al subir el archivo.'
          );
        },
      });
    }
  }

  openEditModal(track: AudioFile): void {
    this.editingTrack.set(track);
    this.editForm.setValue({ title: track.title, artist: track.artist || '' });
  }

  closeEditModal(): void {
    this.editingTrack.set(null);
  }

  onUpdateSubmit(): void {
    if (this.editForm.invalid || !this.editingTrack()) return;
    const trackId = this.editingTrack()!.id;
    const updatedData = this.editForm.getRawValue();
    this.audioService.updateFile(trackId, updatedData as any).subscribe(() => {
      this.closeEditModal();
    });
  }

  deleteTrack(id: string): void {
    if (
      confirm(
        '¿Estás seguro de que quieres borrar esta pista? Esta acción no se puede deshacer.'
      )
    ) {
      this.isLoading.set(true);
      this.audioService.deleteFile(id).subscribe(() => {
        this.isLoading.set(false);
      });
    }
  }

  toggleBroadcast(): void {
    if (this.playerService.isBroadcasting()) {
      this.playerService.stopBroadcast();
    } else {
      this.playerService.startBroadcast();
    }
  }
}
