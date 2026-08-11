/**
 * OmniCash - Interfaces HTTP
 * Rutas de autenticación y seguridad de cuenta.
 */

import { Router } from 'express';
import {
  registrar, verificar, reenviarCodigo, login, login2fa, yo,
  reauth,
  iniciar2faHandler, confirmar2faHandler, desactivar2faHandler,
  misSesiones, revocarUnaSesion, cerrarSesiones,
  recuperar, confirmarRecuperacionHandler,
  solicitarCambioIdentidadHandler, aplicarCambioIdentidadHandler,
  cambiarContrasenaHandler,
} from '../controllers/authController.js';
import { autenticar } from '../middlewares/auth.js';
import { validarBody } from '../middlewares/validacion.js';

export const authRoutes = Router();

// ----- Flujo de apertura de cuenta con verificación de identidad -----
authRoutes.post('/registro',
  validarBody({
    paterno: { required: true, type: 'string' },
    materno: { required: true, type: 'string' },
    nombres: { required: true, type: 'string' },
    dni: { required: true, type: 'string' },
    direccion: { required: true, type: 'string' },
    phone: { required: true, type: 'string' },
    email: { required: true, type: 'string' },
    password: { required: true, type: 'string' },
  }),
  registrar
);

// El código llega por correo; aquí se confirma la identidad
authRoutes.post('/registro/verificar',
  validarBody({ email: { required: true, type: 'string' }, codigo: { required: true, type: 'string' } }),
  verificar
);

// Reenvío del código (con límite por correo)
authRoutes.post('/registro/reenviar',
  validarBody({ email: { required: true, type: 'string' } }),
  reenviarCodigo
);

// ----- Login en dos pasos -----
authRoutes.post('/login',
  validarBody({ email: { required: true, type: 'string' }, password: { required: true, type: 'string' } }),
  login
);

// Segundo paso: código TOTP si el cliente activó el 2FA
authRoutes.post('/login/2fa',
  validarBody({ sesionTemporal: { required: true, type: 'string' }, codigo: { required: true, type: 'string' } }),
  login2fa
);

// ----- Sesión -----
authRoutes.get('/yo', autenticar, yo);

// Confirmación de identidad antes de operaciones sensibles
authRoutes.post('/reauth', autenticar, reauth);

// ----- Segundo factor (TOTP) -----
authRoutes.post('/2fa/iniciar', autenticar, iniciar2faHandler);
authRoutes.post('/2fa/confirmar', autenticar,
  validarBody({ codigo: { required: true, type: 'string' } }),
  confirmar2faHandler
);
authRoutes.post('/2fa/desactivar', autenticar,
  validarBody({ password: { required: true, type: 'string' } }),
  desactivar2faHandler
);

// ----- Recuperación de contraseña (sin sesión) -----
// Paso 1: DNI + correo de respaldo → OTP al correo de respaldo
authRoutes.post('/recuperar',
  validarBody({
    dni: { required: true, type: 'string' },
    backupEmail: { required: true, type: 'string' },
  }),
  recuperar
);

// Paso 2: OTP del correo de respaldo + nueva contraseña
authRoutes.post('/recuperar/confirmar',
  validarBody({
    dni: { required: true, type: 'string' },
    backupEmail: { required: true, type: 'string' },
    codigo: { required: true, type: 'string' },
    nuevaPassword: { required: true, type: 'string' },
  }),
  confirmarRecuperacionHandler
);

// ----- Cambio de datos personales (requieren sesión) -----
// Paso 1: envía OTP al correo principal
authRoutes.post('/identidad/solicitar', autenticar,
  validarBody({ dni: { required: true, type: 'string' } }),
  solicitarCambioIdentidadHandler
);

// Paso 2: aplica los cambios con el código recibido
authRoutes.post('/identidad/aplicar', autenticar,
  validarBody({
    codigo: { required: true, type: 'string' },
    cambios: { required: true, type: 'object' },
  }),
  aplicarCambioIdentidadHandler
);

// Cambio de contraseña estando autenticado (exige la contraseña actual)
authRoutes.post('/cambiar-contrasena', autenticar,
  validarBody({
    passwordActual: { required: true, type: 'string' },
    nuevaPassword: { required: true, type: 'string' },
  }),
  cambiarContrasenaHandler
);

// ----- Gestión de sesiones -----
authRoutes.get('/sesiones', autenticar, misSesiones);
authRoutes.delete('/sesiones/:id', autenticar, revocarUnaSesion);
authRoutes.delete('/sesiones', autenticar, cerrarSesiones);