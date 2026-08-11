/**
 * OmniCash - Aplicación
 * Caso de uso: Vista del trabajador (empleado de soporte).
 * El trabajador puede consultar clientes y realizar depósitos,
 * pero no gestionar estados ni eliminar usuarios.
 */

import { UserRepository } from '../../infrastructure/repositories/UserRepository.js';
import { AccountRepository } from '../../infrastructure/repositories/AccountRepository.js';

/**
 * Lista de clientes con su cuenta, para atención de soporte.
 * @returns {Array} Clientes con cuenta
 */
export async function listarClientesParaTrabajador() {
  const clientes = await UserRepository.findAll({ limit: 500, role: 'CLIENTE' });
  const cuentas = await AccountRepository.findAll();
  const cuentaPorUsuario = new Map(cuentas.map(c => [c.userId, c]));

  return clientes.map(c => ({
    ...c.toPublicJSON(),
    cuenta: cuentaPorUsuario.has(c.id)
      ? { cci: cuentaPorUsuario.get(c.id).cci, balance: cuentaPorUsuario.get(c.id).balance, state: cuentaPorUsuario.get(c.id).state }
      : null,
  }));
}