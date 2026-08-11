/**
 * OmniCash - Interfaces HTTP
 * Rutas de administración:
 * - Dashboard (solo ADMIN).
 * - Gestión de estados / eliminación de usuarios (solo ADMIN).
 * - Crear trabajadores (solo ADMIN).
 * - Listado de clientes para soporte (ADMIN y TRABAJADOR).
 */

import { Router } from 'express';
import {
  dashboard,
  cambiarEstado,
  crearEmpleado,
  eliminar,
  listarClientes,
  yapePendientes,
  yapeAutorizar,
  yapeFinalizar,
} from '../controllers/adminController.js';
import { autenticar, proteger } from '../middlewares/auth.js';
import { validarBody } from '../middlewares/validacion.js';

export const adminRoutes = Router();

// Todas las rutas requieren sesión
adminRoutes.use(autenticar);

// GET /api/admin/dashboard — solo administrador supremo
adminRoutes.get('/dashboard', proteger('ADMIN'), dashboard);

// POST /api/admin/usuarios/:id/estado — bloquear/desbloquear (solo admin)
adminRoutes.post('/usuarios/:id/estado',
  proteger('ADMIN'),
  validarBody({ estado: { required: true, type: 'string' } }),
  cambiarEstado
);

// POST /api/admin/trabajadores — contratar personal (solo admin)
adminRoutes.post('/trabajadores',
  proteger('ADMIN'),
  validarBody({
    name: { required: true, type: 'string' },
    email: { required: true, type: 'string' },
    password: { required: true, type: 'string' },
  }),
  crearEmpleado
);

// DELETE /api/admin/usuarios/:id — eliminar cliente (solo admin)
adminRoutes.delete('/usuarios/:id', proteger('ADMIN'), eliminar);

// GET /api/admin/clientes — soporte (admin y trabajador)
adminRoutes.get('/clientes', proteger('ADMIN', 'TRABAJADOR'), listarClientes);

// ----- Depósitos Yape (dinero real): solo ADMIN -----
// GET /api/admin/yape/pendientes — solicitudes por confirmar
adminRoutes.get('/yape/pendientes', proteger('ADMIN'), yapePendientes);

// POST /api/admin/yape/:id/autorizar — paso 1: contraseña del admin → envía OTP al correo
adminRoutes.post('/yape/:id/autorizar',
  proteger('ADMIN'),
  validarBody({ password: { required: true, type: 'string' } }),
  yapeAutorizar
);

// POST /api/admin/yape/:id/finalizar — paso 2: OTP → ACREDITAR o RECHAZAR
adminRoutes.post('/yape/:id/finalizar',
  proteger('ADMIN'),
  validarBody({
    codigo: { required: true, type: 'string' },
    accion: { required: true, type: 'string' },
  }),
  yapeFinalizar
);