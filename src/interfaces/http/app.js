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
import { webhookMercadoPago, webhookCulqi } from './controllers/cuentaController.js';
import { rutaNoEncontrada, manejadorDeErrores } from './middlewares/errores.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(__dirname, '../web');

export function createApp() {
  const app = express();

  // Parsea JSON del body (máximo 100kb)
  app.use(express.json({ limit: '100kb' }));

  // Sirve el frontend estático (portada de marketing, login, dashboard, admin)
  app.use(express.static(WEB_DIR));

  // La raíz muestra la portada de marketing
  app.get('/', (req, res) => res.sendFile(path.join(WEB_DIR, 'index.html')));

  // El acceso (login/registro) vive en /login.html; /login redirige ahí
  app.get('/login', (req, res) => res.redirect('/login.html'));

  // Si alguien visita /dashboard.html sin sesión, el JS lo redirige a /login.html

  // API pública de autenticación
  app.use('/api/auth', authRoutes);

  // API de cuentas y administración
  app.use('/api/cuenta', cuentaRoutes);
  app.use('/api/admin', adminRoutes);

  // Webhook público de Mercado Pago (notifica los pagos de las recargas QR).
  // El servidor verifica cada pago consultando la API de Mercado Pago.
  app.post('/api/webhooks/mercadopago', express.json({ limit: '1mb' }), webhookMercadoPago);

  // Webhook público de Culqi (notifica los pagos con Yape vía Órdenes).
  // Capturamos el body crudo para verificar la firma.
  app.post('/api/webhooks/culqi',
    express.json({ limit: '1mb', verify: (req, res, buf) => { req.rawBody = buf; } }),
    webhookCulqi
  );

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