/**
 * OmniCash - Infraestructura
 * Job periódico: aplica rentabilidad diaria a todas las cuentas activas a las 00:00.
 * Se ejecuta cada hora y verifica si cambió el día; si cambió, accrue interés para cada cuenta.
 */

import { AccountRepository } from '../repositories/AccountRepository.js';
import { aplicarRentabilidadDiaria } from '../../application/use-cases/aplicarRentabilidadDiaria.js';
import { config } from '../../config.js';

let ultimoDia = null;

/** Verifica si cambió el día y aplica intereses a todas las cuentas. */
export async function verificarYAplicarInteres() {
  const hoy = new Date();
  const diaActual = hoy.toISOString().split('T')[0];

  if (ultimoDia === diaActual) return; // ya procesado hoy
  ultimoDia = diaActual;

  const cuentas = await AccountRepository.findAllActivas();
  for (const cuenta of cuentas) {
    try {
      await aplicarRentabilidadDiaria({ accountId: Number(cuenta.id) });
    } catch (error) {
      //error individual no debería detener el ciclo
      console.error(`Error aplicando interés a cuenta ${cuenta.id}:`, error.message);
    }
  }
}

/** Devuelve el tiempo hasta la medianoche (en ms) para el primer disparo. */
export function tiempoHastaMedianoche() {
  const ahora = new Date();
  const mañana = new Date();
  mañana.setDate(ahora.getDate() + 1);
  mañana.setHours(0, 0, 0, 0);
  return mañana - ahora;
}