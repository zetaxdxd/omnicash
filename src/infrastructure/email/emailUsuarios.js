/**
 * OmniCash - Infraestructura
 * Servicio de correo orientado a usuarios: mensajes de verificación
 * y alertas de seguridad con plantillas propias de OmniCash.
 */

import { enviarCorreo } from './mailer.js';

/**
 * Envía el código de verificación de correo (apertura de cuenta).
 * @param {string} para Correo del destinatario
 * @param {string} codigo Código de 6 dígitos
 */
export function enviarCodigoVerificacion(para, codigo) {
  return enviarCorreo({
    para,
    codigo,
    asunto: 'Tu código de verificación OmniCash',
    texto: 'Recibimos una solicitud para abrir tu cuenta en OmniCash Banco. Usa este código para verificar tu correo electrónico:',
  });
}

/**
 * Envía la alerta de seguridad por intentos fallidos de acceso.
 * @param {string} para Correo del usuario
 * @param {object} info {minutosBloqueo, ip, agente}
 */
export function enviarAlertaFuerzaBruta(para, { minutosBloqueo, ip, agente }) {
  return enviarCorreo({
    para,
    codigo: 'SEGURIDAD',
    asunto: '⚠️ Alerta de seguridad: acceso bloqueado temporalmente',
    texto: `Detectamos varios intentos fallidos de acceso a tu cuenta desde la IP ${ip ?? 'desconocida'} (${agente ?? 'dispositivo desconocido'}). Por seguridad, el acceso quedó bloqueado durante ${minutosBloqueo} minutos. Si no fuiste tú, cambia tu contraseña de inmediato y contacta a seguridad@omnicash.com.`,
  });
}

/**
 * Envía el código para CONFIRMAR la acreditación de un depósito Yape
 * (operación bancaria sensible: solo el administrador la recibe).
 * @param {string} para Correo del administrador
 * @param {object} info {codigo, referencia, monto}
 */
export function enviarCodigoConfirmacionYape(para, { codigo, referencia, monto }) {
  return enviarCorreo({
    para,
    codigo,
    asunto: '🔐 Código para confirmar depósito Yape',
    texto: `Un cliente solicitó acreditar S/ ${monto} (referencia #${referencia}). Solo acredita el depósito si YA recibiste ese monto en tu Yape. Usa este código para autorizar la operación:`,
  });
}

/**
 * Envía el código de recuperación de contraseña al CORREO DE RESPALDO.
 * @param {string} para Correo de respaldo del cliente
 * @param {string} codigo Código de 6 dígitos
 */
export function enviarCodigoRecuperacion(para, codigo) {
  return enviarCorreo({
    para,
    codigo,
    asunto: '🔑 Recupera tu contraseña OmniCash',
    texto: 'Recibimos una solicitud para recuperar tu contraseña en OmniCash Banco. Este código se envía a tu correo DE RESPALDO porque somos tú: solo puedes entrar a tu cuenta demostrando que lo eres. Usa este código (vence en unos minutos):',
  });
}

/**
 * Alerta de seguridad: la contraseña cambió.
 * Se envía al correo PRINCIPAL cuando la contraseña se restablece.
 * @param {string} para Correo principal del usuario
 */
export function enviarAlertaContrasenaCambiada(para) {
  return enviarCorreo({
    para,
    codigo: 'SEGURIDAD',
    asunto: '🔒 Tu contraseña fue cambiada',
    texto: 'Tu contraseña de OmniCash Banco fue restablecida recientemente. Si fuiste tú, ignora este mensaje. Si NO fuiste tú, escribe de inmediato a seguridad@omnicash.com: tus datos han sido usados sin tu permiso.',
  });
}

/**
 * Envía el código para autorizar el cambio de datos personales.
 * Se envía al CORREO PRINCIPAL de la cuenta (el cliente ya está autenticado).
 * @param {string} para Correo principal del usuario
 * @param {string} codigo Código de 6 dígitos
 */
export function enviarCodigoCambioIdentidad(para, codigo) {
  return enviarCorreo({
    para,
    codigo,
    asunto: '🪪 Código para actualizar tus datos personales',
    texto: 'Solicitaste actualizar tus datos personales en OmniCash Banco (nombres, apellidos, dirección, teléfono o DNI). Para confirmar que eres tú, usa este código de un solo uso:',
  });
}

/**
 * Envía el código de APROBACIÓN para cualquier operación bancaria
 * (retiros, transferencias, depósitos, Yape, acciones de administración).
 * @param {string} para Correo principal del usuario
 * @param {string} codigo Código de 6 dígitos
 */
export function enviarCodigoAprobacion(para, codigo) {
  return enviarCorreo({
    para,
    codigo,
    asunto: '🔐 Código de aprobación de operación OmniCash',
    texto: 'Recibimos una solicitud de operación en tu cuenta OmniCash Banco. Para autorizarla, ingresa este código de un solo uso (vence en unos minutos):',
  });
}