/**
 * OmniCash - Interfaces HTTP
 * Rutas de cuenta (requieren sesión de cliente):
 * ver mi cuenta, retirar en cajero, transferir, depósitos.
 * Las operaciones de monto alto exigen reautenticación (X-Reauth-Token).
 */

import { Router } from 'express';
import { verMiCuenta, retirar, transFerir, depositarP, depositarYape, misDepositosYape } from '../controllers/cuentaController.js';
import { autenticar, proteger, exigirReauth } from '../middlewares/auth.js';
import { validarBody } from '../middlewares/validacion.js';
import { config } from '../../../infrastructure/config.js';

export const cuentaRoutes = Router();

// Todas las rutas de cuenta requieren sesión
cuentaRoutes.use(autenticar);

// Middleware: exige reautenticación si el monto de la operación es sensible
function siMontoSensible(middleware) {
  return (req, res, next) => {
    const monto = Number(req.body?.monto ?? 0);
    if (monto >= config.sensitiveOperationMin) return middleware(req, res, next);
    next();
  };
}

// GET /api/cuenta — resumen del cliente autenticado
cuentaRoutes.get('/', verMiCuenta);

// POST /api/cuenta/retiro — cajero genérico (requiere reauth si monto alto)
cuentaRoutes.post('/retiro',
  validarBody({ monto: { required: true, type: 'number', min: 0.01 } }),
  siMontoSensible(exigirReauth),
  retirar
);

// POST /api/cuenta/transferencia — transferencia entre cuentas OmniCash
cuentaRoutes.post('/transferencia',
  validarBody({
    destino: { required: true, type: 'string' },
    monto: { required: true, type: 'number', min: 0.01 },
  }),
  siMontoSensible(exigirReauth),
  transFerir
);

// POST /api/cuenta/deposito — depósito en ventanilla (solo staff)
cuentaRoutes.post('/deposito',
  proteger('ADMIN', 'TRABAJADOR'),
  validarBody({
    cci: { required: true, type: 'string' },
    monto: { required: true, type: 'number', min: 0.01 },
  }),
  depositarP
);

// POST /api/cuenta/deposito-yape — solicitud de carga real por Yape (queda PENDIENTE)
// hasta que el administrador confirme la recepción del dinero
cuentaRoutes.post('/deposito-yape',
  validarBody({
    monto: { required: true, type: 'number', min: 0.01 },
    celularYape: { required: true, type: 'string' },
    operacion: { required: true, type: 'string' },
  }),
  depositarYape
);

// GET /api/cuenta/depositos-yape — historial del cliente
cuentaRoutes.get('/depositos-yape', misDepositosYape);