import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from 'src/app/services/auth.service';
@Component({
  selector: 'app-login',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.component.html',
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);

  // Signals para manejar estados de la UI
  public isLoading = signal<boolean>(false);
  public loginError = signal<string | null>(null);

  loginForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  onSubmit(): void {
    if (this.loginForm.invalid) {
      return;
    }

    this.isLoading.set(true);
    this.loginError.set(null);

    const credentials = this.loginForm.getRawValue();

    this.authService
      .login(credentials as { email: string; password: string })
      .subscribe({
        next: () => {
          this.isLoading.set(false);
          this.router.navigate(['/']); // Navegamos al dashboard al hacer login
        },
        error: (err) => {
          this.isLoading.set(false);
          this.loginError.set('Email o contraseña incorrectos.');
          console.error(err);
        },
      });
  }
}
