/**
 * OmniCash - Interfaces HTTP
 * Rutas de cuenta (requieren sesión de cliente):
 * ver mi cuenta, retirar en cajero, transferir, depósitos.
 * TODAS las operaciones exigen aprobación (contraseña + código OTP
 * del correo) mediante el token REAUTH de un solo uso.
 */

import { Router } from 'express';
import { verMiCuenta, retirar, transFerir, depositarP, depositarYape, misDepositosYape, recargaQr, estadoRecargaQr } from '../controllers/cuentaController.js';
import { autenticar, proteger, exigirReauth } from '../middlewares/auth.js';
import { validarBody } from '../middlewares/validacion.js';

export const cuentaRoutes = Router();

// Todas las rutas de cuenta requieren sesión
cuentaRoutes.use(autenticar);

// GET /api/cuenta — resumen del cliente autenticado
cuentaRoutes.get('/', verMiCuenta);

// POST /api/cuenta/retiro — cajero genérico (siempre exige aprobación)
cuentaRoutes.post('/retiro',
  validarBody({ monto: { required: true, type: 'number', min: 0.01 } }),
  exigirReauth,
  retirar
);

// POST /api/cuenta/transferencia — transferencia entre cuentas OmniCash
cuentaRoutes.post('/transferencia',
  validarBody({
    destino: { required: true, type: 'string' },
    monto: { required: true, type: 'number', min: 0.01 },
  }),
  exigirReauth,
  transFerir
);

// POST /api/cuenta/deposito — depósito en ventanilla (solo staff)
cuentaRoutes.post('/deposito',
  proteger('ADMIN', 'TRABAJADOR'),
  validarBody({
    cci: { required: true, type: 'string' },
    monto: { required: true, type: 'number', min: 0.01 },
  }),
  exigirReauth,
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
  exigirReauth,
  depositarYape
);

// GET /api/cuenta/depositos-yape — historial del cliente
cuentaRoutes.get('/depositos-yape', misDepositosYape);

// POST /api/cuenta/recarga-qr — recarga de dinero real con QR de Mercado Pago
// (el cliente paga con Yape escaneando el QR; la acreditación es automática)
cuentaRoutes.post('/recarga-qr',
  validarBody({ monto: { required: true, type: 'number', min: 0.01 } }),
  exigirReauth,
  recargaQr
);

// GET /api/cuenta/recarga-qr/:id — estado de la recarga (polling del frontend)
cuentaRoutes.get('/recarga-qr/:id', estadoRecargaQr);