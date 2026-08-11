/**
 * OmniCash - Aplicación
 * Caso de uso: Panel de administración.
 * Reúne las métricas que el administrador supremo necesita para
 * gobernar el banco: usuarios, cuentas, activos, auditoría y movimientos.
 */

import { UserRepository } from '../../infrastructure/repositories/UserRepository.js';
import { AccountRepository } from '../../infrastructure/repositories/AccountRepository.js';
import { TransactionRepository } from '../../infrastructure/repositories/TransactionRepository.js';
import { AuditRepository } from '../../infrastructure/repositories/AuditRepository.js';

/**
 * Construye el resumen global del banco (solo administradores).
 * @returns {object} Métricas y listados
 */
export async function obtenerDashboardAdmin() {
  const usuarios = await UserRepository.findAll({ limit: 200 });
  const cuentas = await AccountRepository.findAll();
  const transacciones = await TransactionRepository.findAll(100);
  const auditoria = await AuditRepository.recent(50);

  // Construir mapa usuario->cuenta para el listado
  const cuentaPorUsuario = new Map(cuentas.map(c => [c.userId, c]));

  return {
    metricas: {
      totalUsuarios: await UserRepository.count(),
      totalClientes: await UserRepository.count('CLIENTE'),
      totalTrabajadores: await UserRepository.count('TRABAJADOR'),
      totalCuentas: await AccountRepository.count(),
      activosBanco: await AccountRepository.totalAssets(),
      totalTransacciones: transacciones.length,
    },
    usuarios: usuarios.map(u => ({
      ...u.toPublicJSON(),
      cuenta: cuentaPorUsuario.has(u.id)
        ? { cci: cuentaPorUsuario.get(u.id).cci, balance: cuentaPorUsuario.get(u.id).balance }
        : null,
    })),
    transacciones: transacciones.map(t => t.toJSON()),
    auditoria,
  };
}