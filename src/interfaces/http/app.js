/**
 * OmniCash - Interfaces HTTP
 * Aplicación Express: monta middlewares globales, rutas API
 * y sirve el frontend web estático.
 */

import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { authRoutes } from './routes/authRoutes.js';
import { cuentaRoutes } from './routes/cuentaRoutes.js';
import { adminRoutes } from './routes/adminRoutes.js';
import { rutaNoEncontrada, manejadorDeErrores } from './middlewares/errores.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(__dirname, '../web');

export function createApp() {
  const app = express();

  // Parsea JSON del body (máximo 100kb)
  app.use(express.json({ limit: '100kb' }));

  // Sirve el frontend estático (login, dashboard, admin)
  app.use(express.static(WEB_DIR));

  // La raíz muestra el login
  app.get('/', (req, res) => res.sendFile(path.join(WEB_DIR, 'index.html')));

  // Si alguien visita /dashboard.html sin sesión, el JS lo redirige al login

  // API pública de autenticación
  app.use('/api/auth', authRoutes);

  // API de cuentas y administración
  app.use('/api/cuenta', cuentaRoutes);
  app.use('/api/admin', adminRoutes);

  // Health check para monitoreo
  app.get('/api/health', (req, res) => res.json({
    ok: true,
    nombre: 'OmniCash',
    version: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? 'local',
    tiempo: new Date().toISOString(),
  }));

  // Diagnóstico SMTP: prueba el envío con el proveedor configurado (solo datos de error, no credenciales)
  app.get('/api/health/smtp', async (req, res) => {
    const t0 = Date.now();
    try {
      const { config } = await import('../../infrastructure/config.js');
      if (!config.smtpUser || !config.smtpPassword) {
        return res.json({ ok: false, motivo: 'SMTP_USER/SMTP_PASSWORD no configurados', tiempoMs: Date.now() - t0 });
      }
      const nodemailer = await import('nodemailer');
      const t = nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.smtpPort === 465,
        auth: { user: config.smtpUser, pass: config.smtpPassword },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
      });
      await t.sendMail({
        from: `"${config.emailFrom}" <${config.smtpUser}>`,
        to: config.smtpUser,
        subject: 'Diagnóstico OmniCash',
        text: 'Prueba de envío SMTP desde OmniCash.',
      });
      res.json({ ok: true, host: config.smtpHost, puerto: config.smtpPort, tiempoMs: Date.now() - t0 });
    } catch (e) {
      const detalle = String((e && (e.message || e.response)) || e).split('\n')[0].slice(0, 300);
      res.json({ ok: false, host: config.smtpHost, puerto: config.smtpPort, error: detalle, tiempoMs: Date.now() - t0 });
    }
  });

  // 404 para rutas API desconocidas
  app.use('/api', rutaNoEncontrada);

  // Manejo de errores centralizado (siempre al final)
  app.use(manejadorDeErrores);

  return app;
}