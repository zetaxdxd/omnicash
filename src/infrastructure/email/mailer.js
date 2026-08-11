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

/** Crea el transportador SMTP una sola vez (patrón lazy singleton) */
function obtenerTransporter() {
  if (!config.gmailUser || !config.gmailAppPassword) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: config.gmailUser, pass: config.gmailAppPassword },
    });
  }
  return transporter;
}

/**
 * Envía un correo con el código OTP (o lo muestra en consola en modo dev).
 * @param {object} params {para, codigo, asunto, texto}
 */
async function enviarCorreo({ para, codigo, asunto, texto }) {
  const smtp = obtenerTransporter();
  if (!smtp) {
    // Modo desarrollo: el código se loguea para poder probar el flujo completo
    console.warn(`[correo] SMTP no configurado (GMAIL_USER / GMAIL_APP_PASSWORD). Para: ${para}`);
    console.warn(`[correo] ${asunto}: ${texto} Codigo: ${codigo}`);
    return;
  }
  await smtp.sendMail({
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
  });
}

export { enviarCorreo };