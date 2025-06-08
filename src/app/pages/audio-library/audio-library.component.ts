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
  private fb = inject(FormBuilder);
  public playerService = inject(PlayerService);

  public isLoading = signal<boolean>(true);
  public uploadError = signal<string | null>(null);
  public editingTrack = signal<AudioFile | null>(null);

  public editForm = this.fb.group({
    title: ['', Validators.required],
    artist: [''],
  });

  ngOnInit(): void {
    this.audioService.loadFiles().subscribe(() => {
      this.isLoading.set(false);
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      this.isLoading.set(true);
      this.uploadError.set(null);

      this.audioService.uploadFile(file).subscribe({
        next: () => {
          this.isLoading.set(false);
        },
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

  // --- NUEVO MÉTODO PARA REPRODUCIR ---
  togglePlay(track: AudioFile): void {
    if (this.playerService.currentlyPlaying()?.id === track.id) {
      this.playerService.stop();
    } else {
      this.playerService.play(track);
    }
  }
}
