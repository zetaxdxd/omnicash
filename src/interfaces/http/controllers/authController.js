/**
 * OmniCash - Interfaces HTTP
 * Controlador de autenticación y seguridad de la cuenta:
 * registro con verificación de correo, login con anti fuerza bruta,
 * segundo factor TOTP, reautenticación y gestión de sesiones.
 */

import { solicitarRegistro, emitirCodigoVerificacion } from '../../../application/use-cases/registrarUsuario.js';
import { PendingRegistrationRepository } from '../../../infrastructure/repositories/PendingRegistrationRepository.js';
import { verificarEmail } from '../../../application/use-cases/verificarEmail.js';
import { iniciarSesion } from '../../../application/use-cases/iniciarSesion.js';
import { verificarSegundoFactor } from '../../../application/use-cases/verificarSegundoFactor.js';
import { reautenticar } from '../../../application/use-cases/reautenticar.js';
import { solicitarRecuperacion } from '../../../application/use-cases/solicitarRecuperacion.js';
import { confirmarRecuperacion } from '../../../application/use-cases/confirmarRecuperacion.js';
import { solicitarCambioIdentidad } from '../../../application/use-cases/solicitarCambioIdentidad.js';
import { aplicarCambioIdentidad } from '../../../application/use-cases/aplicarCambioIdentidad.js';
import { cambiarContrasena } from '../../../application/use-cases/cambiarContrasena.js';
import {
  iniciar2fa, confirmar2fa, desactivar2fa,
  listarSesiones, revocarSesion, revocarTodasSesiones,
} from '../../../application/use-cases/seguridadCuenta.js';
import { consultarDni } from '../../../infrastructure/reniec/consultaDni.js';
import { normalizarDni } from '../../../infrastructure/security/peru.js';
import { NotFoundError } from '../../../domain/errors/DomainError.js';
import QRCode from 'qrcode';

/**
 * GET /api/auth/dni/:numero — autocompleta los datos de identidad del DNI.
 * Público: el cliente escribe su DNI en el registro y el sistema rellena
 * automáticamente apellidos y nombres (validación RENIEC en vivo).
 */
export async function consultarDniHandler(req, res, next) {
  try {
    const dni = normalizarDni(req.params.numero);
    if (!dni) {
      return res.status(400).json({ error: 'DNI inválido: debe tener 8 dígitos' });
    }
    const identidad = await consultarDni(dni.slice(0, 8));
    if (!identidad) {
      throw new NotFoundError('No pudimos verificar el DNI. Completa tus datos manualmente');
    }
    res.json({
      dni: dni.slice(0, 8),
      paterno: identidad.apellidoPaterno,
      materno: identidad.apellidoMaterno,
      nombres: identidad.nombres,
    });
  } catch (error) {
    next(error);
  }
}

/** POST /api/auth/registro — solicita apertura de cuenta y envía el OTP */
export async function registrar(req, res, next) {
  try {
    const { paterno, materno, nombres, dni, direccion, phone, email, backupEmail, password } = req.body ?? {};
    const resultado = await solicitarRegistro({ paterno, materno, nombres, dni, direccion, phone, email, backupEmail, password });
    res.status(201).json({
      mensaje: 'Revisa tu correo: te enviamos un código para verificar tu identidad',
      ...resultado,
    });
  } catch (error) {
    next(error);
  }
}

/** POST /api/auth/registro/verificar — activa la cuenta con el código */
export async function verificar(req, res, next) {
  try {
    const { email, codigo } = req.body ?? {};
    const resultado = await verificarEmail({ email, codigo });
    res.json({ mensaje: 'Correo verificado. Tu cuenta fue activada', ...resultado });
  } catch (error) {
    next(error);
  }
}

/** POST /api/auth/registro/reenviar — envía un código nuevo */
export async function reenviarCodigo(req, res, next) {
  try {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const pendiente = await PendingRegistrationRepository.findByEmail(email);
    if (!pendiente || new Date(pendiente.expiresAt) <= new Date()) {
      throw new NotFoundError('No hay una solicitud de registro pendiente para este correo');
    }
    await emitirCodigoVerificacion(email);
    res.json({ mensaje: 'Te enviamos un código nuevo por correo', reenviado: true });
  } catch (error) {
    next(error);
  }
}

/** POST /api/auth/login — primer paso: contraseña (+ token temporal si hay 2FA) */
export async function login(req, res, next) {
  try {
    const { email, password } = req.body ?? {};
    const resultado = await iniciarSesion({
      email,
      password,
      userAgent: req.headers['user-agent'] ?? null,
      ip: req.ip ?? null,
    });
    res.json({ mensaje: 'Sesión iniciada', ...resultado });
  } catch (error) {
    next(error);
  }
}

/** POST /api/auth/login/2fa — segundo paso: código de la app */
export async function login2fa(req, res, next) {
  try {
    const { sesionTemporal, codigo } = req.body ?? {};
    const resultado = await verificarSegundoFactor({
      sesionTemporal,
      codigoTotp: codigo,
      userAgent: req.headers['user-agent'] ?? null,
      ip: req.ip ?? null,
    });
    res.json({ mensaje: 'Identidad verificada', ...resultado });
  } catch (error) {
    next(error);
  }
}

/** GET /api/auth/yo — datos del usuario autenticado */
export function yo(req, res) {
  res.json({ usuario: req.usuario.toPublicJSON() });
}

// ---------------- Recuperación de contraseña (público) ----------------

/** POST /api/auth/recuperar — paso 1: DNI + correo de respaldo, envía OTP al respaldo */
export async function recuperar(req, res, next) {
  try {
    const { dni, backupEmail } = req.body ?? {};
    const resultado = await solicitarRecuperacion({ dni, backupEmail });
    res.json({
      mensaje: 'Si los datos coinciden, enviamos un código a tu correo de respaldo',
      ...resultado,
    });
  } catch (error) {
    next(error);
  }
}

/** POST /api/auth/recuperar/confirmar — paso 2: OTP del respaldo + nueva contraseña */
export async function confirmarRecuperacionHandler(req, res, next) {
  try {
    const { dni, backupEmail, codigo, nuevaPassword } = req.body ?? {};
    const resultado = await confirmarRecuperacion({ dni, backupEmail, codigo, nuevaPassword });
    res.json({
      mensaje: 'Contraseña restablecida. Inicia sesión con tu nueva contraseña',
      ...resultado,
    });
  } catch (error) {
    next(error);
  }
}

// ---------------- Cambio de datos personales (requieren sesión) ----------------

/** POST /api/auth/identidad/solicitar — envía OTP al correo principal */
export async function solicitarCambioIdentidadHandler(req, res, next) {
  try {
    const { dni } = req.body ?? {};
    const resultado = await solicitarCambioIdentidad({ userId: req.usuario.id, dni });
    res.json({
      mensaje: 'Te enviamos un código a tu correo principal para autorizar el cambio',
      ...resultado,
    });
  } catch (error) {
    next(error);
  }
}

/** POST /api/auth/identidad/aplicar — aplica los cambios con el código */
export async function aplicarCambioIdentidadHandler(req, res, next) {
  try {
    const { codigo, cambios } = req.body ?? {};
    const resultado = await aplicarCambioIdentidad({ userId: req.usuario.id, codigo, cambios });
    res.json({ mensaje: 'Tus datos personales fueron actualizados', ...resultado });
  } catch (error) {
    next(error);
  }
}

/** POST /api/auth/cambiar-contrasena — cambia la contraseña estando autenticado */
export async function cambiarContrasenaHandler(req, res, next) {
  try {
    const { passwordActual, nuevaPassword } = req.body ?? {};
    const resultado = await cambiarContrasena({
      userId: req.usuario.id,
      sesionActualId: req.sesion.id,
      passwordActual,
      nuevaPassword,
    });
    res.json({ mensaje: 'Contraseña cambiada. Las demás sesiones se cerraron', ...resultado });
  } catch (error) {
    next(error);
  }
}

// ---------------- Seguridad de cuenta (requieren sesión) ----------------

/** POST /api/auth/reauth — vuelve a validar la identidad para operaciones sensibles */
export async function reauth(req, res, next) {
  try {
    const { password, codigo } = req.body ?? {};
    const resultado = await reautenticar({
      userId: req.usuario.id,
      password,
      codigoTotp: codigo,
      userAgent: req.headers['user-agent'] ?? null,
      ip: req.ip ?? null,
    });
    res.json({ mensaje: 'Identidad confirmada. Puedes continuar la operación', ...resultado });
  } catch (error) {
    next(error);
  }
}

/** POST /api/auth/2fa/iniciar — genera el secreto, QR y URI del 2FA */
export async function iniciar2faHandler(req, res, next) {
  try {
    const resultado = await iniciar2fa({ userId: req.usuario.id });
    const qr = await QRCode.toDataURL(resultado.otpauth);
    res.json({ ...resultado, qr });
  } catch (error) {
    next(error);
  }
}

/** POST /api/auth/2fa/confirmar — valida el código y activa el 2FA */
export async function confirmar2faHandler(req, res, next) {
  try {
    const { codigo } = req.body ?? {};
    const resultado = await confirmar2fa({ userId: req.usuario.id, codigo });
    res.json({ mensaje: 'Segundo factor activado', ...resultado });
  } catch (error) {
    next(error);
  }
}

/** POST /api/auth/2fa/desactivar — desactiva el 2FA con la contraseña */
export async function desactivar2faHandler(req, res, next) {
  try {
    const { password } = req.body ?? {};
    const resultado = await desactivar2fa({ userId: req.usuario.id, password });
    res.json({ mensaje: 'Segundo factor desactivado', ...resultado });
  } catch (error) {
    next(error);
  }
}

/** GET /api/auth/sesiones — lista de sesiones activas */
export async function misSesiones(req, res, next) {
  try {
    const resultado = await listarSesiones({ userId: req.usuario.id, sesionActualId: req.sesion.id });
    res.json(resultado);
  } catch (error) {
    next(error);
  }
}

/** DELETE /api/auth/sesiones/:id — revoca una sesión */
export async function revocarUnaSesion(req, res, next) {
  try {
    const resultado = await revocarSesion({ userId: req.usuario.id, sesionId: Number(req.params.id) });
    res.json(resultado);
  } catch (error) {
    next(error);
  }
}

/** DELETE /api/auth/sesiones — cierra todas las demás sesiones */
export async function cerrarSesiones(req, res, next) {
  try {
    const resultado = await revocarTodasSesiones({ userId: req.usuario.id, sesionActualId: req.sesion.id });
    res.json({ mensaje: 'Cerraste sesión en los demás dispositivos', ...resultado });
  } catch (error) {
    next(error);
  }
}