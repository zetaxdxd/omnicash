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
  auditoria,
  cambiarEstado,
  crearEmpleado,
  eliminar,
  listarClientes,
  yapeDepositos,
  completarRetiroRedCajeroAdmin,
  listarRetirosPendientesAdmin,
} from '../controllers/adminController.js';
import { autenticar, proteger, exigirReauth } from '../middlewares/auth.js';
import { validarBody } from '../middlewares/validacion.js';

export const adminRoutes = Router();

// Todas las rutas requieren sesión
adminRoutes.use(autenticar);

// GET /api/admin/dashboard — solo administrador supremo
adminRoutes.get('/dashboard', proteger('ADMIN'), dashboard);

// GET /api/admin/auditoria — registro de auditoría en bloques (solo ADMIN)
adminRoutes.get('/auditoria', proteger('ADMIN'), auditoria);

// POST /api/admin/usuarios/:id/estado — bloquear/desbloquear (solo admin, con aprobación)
adminRoutes.post('/usuarios/:id/estado',
  proteger('ADMIN'),
  validarBody({ estado: { required: true, type: 'string' } }),
  exigirReauth,
  cambiarEstado
);

// POST /api/admin/trabajadores — contratar personal (solo admin, con aprobación)
adminRoutes.post('/trabajadores',
  proteger('ADMIN'),
  validarBody({
    name: { required: true, type: 'string' },
    email: { required: true, type: 'string' },
    password: { required: true, type: 'string' },
  }),
  exigirReauth,
  crearEmpleado
);

// DELETE /api/admin/usuarios/:id — eliminar cliente (solo admin, con aprobación)
adminRoutes.delete('/usuarios/:id', proteger('ADMIN'), exigirReauth, eliminar);

// GET /api/admin/clientes — soporte (admin y trabajador)
adminRoutes.get('/clientes', proteger('ADMIN', 'TRABAJADOR'), listarClientes);

// ----- Depósitos Yape (reporte, sin aprobación): solo ADMIN -----
// GET /api/admin/yape/depositos — últimos depósitos (reporte de operaciones)
adminRoutes.get('/yape/depositos', proteger('ADMIN'), yapeDepositos);

// RETIRO SIN TARJERA RED (admin)
adminRoutes.post('/cajero/retiro/:withdrawalId/completar',
  proteger('ADMIN', 'TRABAJADOR'),
  exigirReauth,
  validarBody({ codigo: { required: true, type: 'string' } }),
  completarRetiroRedCajeroAdmin
);

adminRoutes.get('/cajero/retiros-pendientes',
  proteger('ADMIN', 'TRABAJADOR'),
  exigirReauth,
  listarRetirosPendientesAdmin
);