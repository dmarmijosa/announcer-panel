import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) {
    return true; // Si está autenticado, permite el acceso
  }

  // Si no está autenticado, redirige a la página de login
  router.navigate(['/login']);
  return false;
};
