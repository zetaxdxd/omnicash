/**
 * OmniCash - Interfaces HTTP
 * Rutas de cuenta (requieren sesión de cliente):
 * ver mi cuenta, retirar en cajero, transferir, depósitos.
 * TODAS las operaciones exigen aprobación (contraseña + código OTP
 * del correo) mediante el token REAUTH de un solo uso.
 */

import { Router } from 'express';
import { verMiCuenta, retirar, transFerir, depositarP, depositarYape, misDepositosYape,   recargaQr, estadoRecargaQr, vencerRecargaQr, yapeComercio, solicitarRetiroRedCajero, listarCajerosAliados, historialRetirosCliente, rentabilidad, crearAlcancia, aportarAlcancia, sacarDeAlcancia, crearTanda, unirseTanda, iniciarCicloTanda, culqiConfig, recargaCulqi, estadoRecargaCulqi, vencerRecargaCulqi } from '../controllers/cuentaController.js';
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

// POST /api/cuenta/recarga-qr/:id/expirar — deshace el QR tras su temporizador
cuentaRoutes.post('/recarga-qr/:id/expirar', vencerRecargaQr);

// GET /api/cuenta/culqi-config — llave pública de Culqi para el frontend
cuentaRoutes.get('/culqi-config', culqiConfig);

// POST /api/cuenta/recarga-culqi — recarga de dinero real con QR de Yape (Culqi)
cuentaRoutes.post('/recarga-culqi',
  validarBody({ monto: { required: true, type: 'number', min: 0.01 } }),
  exigirReauth,
  recargaCulqi
);

// GET /api/cuenta/recarga-culqi/:id — estado de la recarga (polling del frontend)
cuentaRoutes.get('/recarga-culqi/:id', estadoRecargaCulqi);

// POST /api/cuenta/recarga-culqi/:id/expirar — deshace el QR tras su temporizador
cuentaRoutes.post('/recarga-culqi/:id/expirar', vencerRecargaCulqi);

// GET /api/cuenta/yape-comercio — datos y QR del Yape del banco (recarga manual)
cuentaRoutes.get('/yape-comercio', yapeComercio);

// RED DE CAJEROS (retiros sin tarjeta)
cuentaRoutes.post('/cajero/retiro',
  validarBody({ monto: { required: true, type: 'number', min: 0.01 } }),
  exigirReauth,
  solicitarRetiroRedCajero
);

// LISTA DE CAJEROS aliados de la red (solo lectura para el cliente)
cuentaRoutes.get('/cajeros', listarCajerosAliados);

// HISTORIAL DE RETIROS EN CAJERO (cliente)
cuentaRoutes.get('/retiros-cajero', historialRetirosCliente);

// RENTABILIDAD DIARIA
cuentaRoutes.get('/rentabilidad', rentabilidad);

// ALCANCÍAS 3D
cuentaRoutes.post('/alcancia', crearAlcancia);
cuentaRoutes.post('/alcancia/aportar', aportarAlcancia);
cuentaRoutes.post('/alcancia/retirar', sacarDeAlcancia);

// LA TANDA
cuentaRoutes.post('/tanda', crearTanda);
cuentaRoutes.post('/tanda/unirse', unirseTanda);
cuentaRoutes.post('/tanda/iniciar-ciclo', iniciarCicloTanda);