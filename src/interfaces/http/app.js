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
import { webhookMercadoPago } from './controllers/cuentaController.js';
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

  // Webhook público de Mercado Pago (notifica los pagos de las recargas QR).
  // El servidor verifica cada pago consultando la API de Mercado Pago.
  app.post('/api/webhooks/mercadopago', express.json({ limit: '1mb' }), webhookMercadoPago);

  // Health check para monitoreo
  app.get('/api/health', (req, res) => res.json({
    ok: true,
    nombre: 'OmniCash',
    version: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? 'local',
    tiempo: new Date().toISOString(),
  }));

  // 404 para rutas API desconocidas
  app.use('/api', rutaNoEncontrada);

  // Manejo de errores centralizado (siempre al final)
  app.use(manejadorDeErrores);

  return app;
}