/**
 * OmniCash - Interfaces HTTP
 * Controlador de cuentas: operaciones del cliente sobre su dinero.
 * - Ver su cuenta y movimientos.
 * - Retirar en el cajero genérico.
 * - Transferir créditos a otra cuenta OmniCash.
 * - Depositar (lo ejecuta un trabajador/administrador en ventanilla).
 */

import { consultarCuenta } from '../../../application/use-cases/consultarCuenta.js';
import { retirarEnCajero } from '../../../application/use-cases/retirarEnCajero.js';
import { transferir } from '../../../application/use-cases/transferir.js';
import { depositar } from '../../../application/use-cases/depositar.js';
import { solicitarDepositoYape } from '../../../application/use-cases/solicitarDepositoYape.js';
import { YapeDepositRepository } from '../../../infrastructure/repositories/YapeDepositRepository.js';

/** GET /api/cuenta — resumen de la cuenta del cliente autenticado */
export async function verMiCuenta(req, res, next) {
  try {
    const resultado = await consultarCuenta({ userId: req.usuario.id });
    res.json(resultado);
  } catch (error) {
    next(error);
  }
}

/** POST /api/cuenta/retiro — retiro en el cajero genérico */
export async function retirar(req, res, next) {
  try {
    const { monto } = req.body ?? {};
    const resultado = await retirarEnCajero({ userId: req.usuario.id, monto, autorId: req.usuario.id });
    res.json({ mensaje: 'Retiro realizado correctamente', ...resultado });
  } catch (error) {
    next(error);
  }
}

/** POST /api/cuenta/transferencia — transferir a otra cuenta */
export async function transFerir(req, res, next) {
  try {
    const { destino, monto } = req.body ?? {};
    const resultado = await transferir({ userId: req.usuario.id, destinoCci: destino, monto });
    res.json({ mensaje: 'Transferencia realizada correctamente', ...resultado });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/cuenta/deposito — depósito a una cuenta por CCI.
 * Lo ejecutan trabajadores y administradores (ventanilla).
 */
export async function depositarP(req, res, next) {
  try {
    const { cci, monto } = req.body ?? {};
    const resultado = await depositar({ cci, monto, autorId: req.usuario.id });
    res.json({ mensaje: 'Depósito realizado correctamente', ...resultado });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/cuenta/deposito-yape — solicita cargar créditos vía Yape REAL.
 * El cliente envía el dinero al Yape del banco y la solicitud queda
 * PENDIENTE hasta que el administrador la confirme.
 */
export async function depositarYape(req, res, next) {
  try {
    const { monto, celularYape, operacion } = req.body ?? {};
    const resultado = await solicitarDepositoYape({ userId: req.usuario.id, monto, payerPhone: celularYape, operacion });
    res.status(201).json({
      mensaje: 'Solicitud registrada. Envía el Yape y espera la confirmación del banco',
      ...resultado,
    });
  } catch (error) {
    next(error);
  }
}

/** GET /api/cuenta/depositos-yape — historial de depósitos Yape del cliente */
export async function misDepositosYape(req, res, next) {
  try {
    const depositos = await YapeDepositRepository.findByUserId(req.usuario.id);
    res.json({ depositos });
  } catch (error) {
    next(error);
  }
}