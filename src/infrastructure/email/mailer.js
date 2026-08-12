/**
 * OmniCash - Infraestructura
 * Servicio de correo: envía los códigos de verificación y alertas
 * de seguridad usando SMTP de Gmail (contraseña de aplicación).
 *
 * Si no hay SMTP configurado (desarrollo), los códigos se muestran
 * en la consola del servidor con una advertencia clara.
 */

import nodemailer from 'nodemailer';
import { config } from '../config.js';

let transporter = null;

/** Crea el transportador SMTP (465 segura primero, 587 STARTTLS como respaldo) */
function obtenerTransporter() {
  if (!config.gmailUser || !config.gmailAppPassword) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: config.gmailUser, pass: config.gmailAppPassword },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
  }
  return transporter;
}

/** Si el puerto 465 falla, reintenta por 587 (STARTTLS) sin bloquear al usuario */
async function enviarConRespaldo(transporter, opciones, para) {
  try {
    await transporter.sendMail(opciones);
    return;
  } catch (error) {
    console.error(`[correo] SMTP 465 falló (${para}): ${error.message}`);
  }
  const respaldo = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user: config.gmailUser, pass: config.gmailAppPassword },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
  await respaldo.sendMail(opciones);
}

/**
 * Envía un correo con el código OTP (o lo muestra en consola en modo dev).
 * El código SIEMPRE se loguea en consola como respaldo de diagnóstico.
 * @param {object} params {para, codigo, asunto, texto}
 */
async function enviarCorreo({ para, codigo, asunto, texto }) {
  const smtp = obtenerTransporter();
  if (!smtp) {
    console.warn(`[correo] SMTP no configurado (GMAIL_USER / GMAIL_APP_PASSWORD). Para: ${para}`);
    console.warn(`[correo] ${asunto}: ${texto} Codigo: ${codigo}`);
    return;
  }
  console.log(`[correo] Enviando a ${para} — ${asunto}`);
  await enviarConRespaldo(smtp, {
    from: `"OmniCash Banco" <${config.gmailUser}>`,
    to: para,
    subject: asunto,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;border:1px solid #e5e5e5;border-radius:12px;overflow:hidden">
        <div style="background:#3F4E69;padding:18px 24px;display:flex;align-items:center;gap:10px">
          <span style="color:#fff;font-size:20px;font-weight:bold">OmniCash</span>
          <span style="color:#F4600D;font-size:20px;font-weight:bold">Banco Digital</span>
        </div>
        <div style="padding:24px">
          <p>Hola,</p>
          <p>${texto}</p>
          <div style="background:#fdf1e7;border:1px dashed #F4600D;border-radius:8px;padding:16px;text-align:center;font-size:28px;letter-spacing:6px;font-weight:bold;color:#F4600D">${codigo}</div>
          <p style="font-size:12px;color:#888;margin-top:16px">Este código es de un solo uso y expira en unos minutos. Si no solicitaste esta operación, ignora este correo y avisa a seguridad@omnicash.com.</p>
        </div>
      </div>
    `,
  }, para);
}

export { enviarCorreo };