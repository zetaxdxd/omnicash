/**
 * OmniCash - Interfaces HTTP
 * Rutas de autenticación y seguridad de cuenta.
 */

import { Router } from 'express';
import {
  registrar, verificar, reenviarCodigo, login, login2fa, yo,
  reauth, reauthIniciar,
  iniciar2faHandler, confirmar2faHandler, desactivar2faHandler,
  misSesiones, revocarUnaSesion, cerrarSesiones,
  recuperar, verificarRecuperacionHandler, confirmarRecuperacionHandler,
  solicitarCambioIdentidadHandler, aplicarCambioIdentidadHandler,
  cambiarContrasenaHandler,
  consultarDniHandler, soporteHandler,
} from '../controllers/authController.js';
import { autenticar } from '../middlewares/auth.js';
import { validarBody } from '../middlewares/validacion.js';

export const authRoutes = Router();

// Autocompletado de identidad: DNI → nombres y apellidos (RENIEC)
authRoutes.get('/dni/:numero', consultarDniHandler);

// Equipo de soporte (requiere sesión): nombre + WhatsApp de contacto
authRoutes.get('/soporte', autenticar, soporteHandler);

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
authRoutes.post('/reauth/iniciar', autenticar, reauthIniciar);
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
// Paso 1: DNI + correo principal → OTP al correo principal
authRoutes.post('/recuperar',
  validarBody({
    dni: { required: true, type: 'string' },
    email: { required: true, type: 'string' },
  }),
  recuperar
);

// Paso 1.5: valida el OTP sin cambiar la contraseña
authRoutes.post('/recuperar/verificar-codigo',
  validarBody({
    dni: { required: true, type: 'string' },
    email: { required: true, type: 'string' },
    codigo: { required: true, type: 'string' },
  }),
  verificarRecuperacionHandler
);

// Paso 2: OTP verificado + nueva contraseña
authRoutes.post('/recuperar/confirmar',
  validarBody({
    dni: { required: true, type: 'string' },
    email: { required: true, type: 'string' },
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