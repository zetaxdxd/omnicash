/**
 * OmniCash - Aplicación
 * Caso de uso: Completar retiro en cajero de la red OmniCash.
 * El personal autorizado (admin/trabajador) confirma el retiro introduciendo el código.
 *
 * @param {object} input { withdrawalId, codigoPlain, confirmUserId }
 * @returns {object} { state, saldoRestante, comision, totalDebitado }
 */
export async function completarRetiroRedCajero({ withdrawalId, codigoPlain, confirmUserId }) {
  // ... (misma lógica que en solicitarRetiroRedCajero.js)
}