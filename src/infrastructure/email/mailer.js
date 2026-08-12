/**
 * OmniCash - Infraestructura
 * Servicio de correo: envía los códigos de verificación y alertas
 * de seguridad vía SMTP transaccional (Brevo por defecto; Gmail
 * como respaldo si SMTP_HOST está vacío).
 *
 * Brevo no bloquea conexiones desde datacenters (a diferencia de
 * Gmail) y funciona sin fricción en Render.
 */

import nodemailer from 'nodemailer';
import { config } from '../config.js';

let transporter = null;

/** Crea el transportador SMTP una sola vez (patrón lazy singleton) */
function obtenerTransporter() {
  if (!config.smtpUser || !config.smtpPassword) return null;
  if (!transporter) {
    const host = config.smtpHost || 'smtp.gmail.com';
    const secure = (config.smtpPort === 465) || (!config.smtpHost);
    transporter = nodemailer.createTransport({
      host,
      port: config.smtpPort,
      secure,
      auth: { user: config.smtpUser, pass: config.smtpPassword },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
  }
  return transporter;
}

/** Si el host primario falla, reintenta con Gmail por 587 (último respaldo) */
async function enviarConRespaldo(transporter, opciones, para) {
  try {
    await transporter.sendMail(opciones);
    return;
  } catch (error) {
    console.error(`[correo] SMTP ${config.smtpHost || 'smtp.gmail.com'}:${config.smtpPort} falló (${para}): ${error.message}`);
    if (config.smtpHost) {
      // Respaldos: Gmail 465 → Gmail 587 (si el proveedor primario cayó)
      const hosts = [
        { host: 'smtp.gmail.com', port: 465, secure: true },
        { host: 'smtp.gmail.com', port: 587, secure: false },
      ];
      for (const h of hosts) {
        try {
          const respaldo = nodemailer.createTransport({
            host: h.host,
            port: h.port,
            secure: h.secure,
            auth: { user: config.gmailUser, pass: config.gmailAppPassword },
            connectionTimeout: 10000,
            greetingTimeout: 10000,
            socketTimeout: 15000,
          });
          await respaldo.sendMail(opciones);
          console.log(`[correo] Enviado por respaldo ${h.host}:${h.port}`);
          return;
        } catch (e2) {
          console.error(`[correo] Respaldo ${h.host}:${h.port} falló: ${e2.message}`);
        }
      }
    }
    throw error;
  }
}

/**
 * Envía un correo con el código OTP (o lo muestra en consola en modo dev).
 * @param {object} params {para, codigo, asunto, texto}
 */
async function enviarCorreo({ para, codigo, asunto, texto }) {
  const smtp = obtenerTransporter();
  if (!smtp) {
    // Modo desarrollo: el código se loguea para poder probar el flujo completo
    console.warn(`[correo] SMTP no configurado (SMTP_USER / SMTP_PASSWORD). Para: ${para}`);
    console.warn(`[correo] ${asunto}: ${texto} Codigo: ${codigo}`);
    return;
  }
  console.log(`[correo] Enviando a ${para} — ${asunto}`);
  await enviarConRespaldo(smtp, {
    from: `"${config.emailFrom}" <${config.smtpUser}>`,
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
