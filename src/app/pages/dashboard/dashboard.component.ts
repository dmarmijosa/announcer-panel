import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';

@Component({
  selector: 'app-dashboard',
  imports: [CommonModule],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent {
  public songCount = signal<number>(0);
  public listenersCount = signal<number>(0);
  public isLive = signal<boolean>(false);

  constructor() {
    // Aquí, en el futuro, llamaríamos a los servicios para obtener los datos reales.
    // Por ejemplo:
    // this.audioService.getSongCount().subscribe(count => this.songCount.set(count));
  }
}
