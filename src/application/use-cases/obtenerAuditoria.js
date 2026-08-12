/**
 * OmniCash - Aplicación
 * Caso de uso: Registro de auditoría del banco.
 * Página exclusiva del administrador supremo. Devuelve la traza
 * de acciones sensibles segmentada en bloques por antigüedad:
 * - recientes: últimos 15 días
 * - histórico: como máximo los últimos 3 meses
 */

import { AuditRepository } from '../../infrastructure/repositories/AuditRepository.js';

/**
 * @returns {object} {recientes: [], historico: []} — registros ordenados de más reciente a más antiguo
 */
export async function obtenerAuditoria() {
  const [recientes, historico] = await Promise.all([
    AuditRepository.recentDesde(15, 1000),
    AuditRepository.recentDesde(90, 1000),
  ]);
  return { recientes, historico };
}
