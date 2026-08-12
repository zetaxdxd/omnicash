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
  app.get('/api/health', (req, res) => res.json({ ok: true, nombre: 'OmniCash', tiempo: new Date().toISOString() }));

  // Diagnóstico del SMTP (solo dev: prueba la conectividad con Gmail)
  app.get('/api/health/smtp', async (req, res) => {
    if (process.env.NODE_ENV === 'production') return res.json({ smtp: 'oculto' });
    const t0 = Date.now();
    try {
      const { config } = await import('../../infrastructure/config.js');
      if (!config.gmailUser || !config.gmailAppPassword) {
        return res.json({ smtp: 'sin-configurar', tiempoMs: Date.now() - t0 });
      }
      const net = await import('node:net');
      const resultado = await new Promise((resolve) => {
        const s = net.connect({ host: 'smtp.gmail.com', port: 465, timeout: 8000 });
        s.on('connect', () => { s.destroy(); resolve({ puerto: 465, estado: 'ok' }); });
        s.on('timeout', () => { s.destroy(); resolve({ puerto: 465, estado: 'timeout' }); });
        s.on('error', (e) => { s.destroy(); resolve({ puerto: 465, estado: 'error', detalle: e.code || e.message }); });
      });
      res.json({ smtp: 'configurado', ...resultado, tiempoMs: Date.now() - t0 });
    } catch (e) {
      res.json({ smtp: 'error', detalle: e.message, tiempoMs: Date.now() - t0 });
    }
  });

  // 404 para rutas API desconocidas
  app.use('/api', rutaNoEncontrada);

  // Manejo de errores centralizado (siempre al final)
  app.use(manejadorDeErrores);

  return app;
}