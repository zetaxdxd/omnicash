/**
 * OmniCash - Aplicación
 * Casos de uso para La Tanda: ahorro grupal con pozo rotativo.
 */

import { AccountRepository } from '../../infrastructure/repositories/AccountRepository.js';
import { TandaRepository } from '../../infrastructure/repositories/TandaRepository.js';
import { TransactionRepository } from '../../infrastructure/repositories/TransactionRepository.js';
import { TRANSACTION_TYPES } from '../../domain/entities/Transaction.js';
import { BusinessRuleViolationError } from '../../domain/errors/DomainError.js';

/** Crea una nueva tanda (ahorro grupal) para el usuario.
 *  El usuario se une automáticamente como organizador.
 */
export async function crearTanda({ userId, nombre, pozoInicial }) {
  const cuenta = await AccountRepository.findByUserId(userId);
  if (!cuenta) throw new BusinessRuleViolationError('No tienes una cuenta bancaria activa');

  const tanda = await TandaRepository.create({ nombre, pozoInicial, userId: cuenta.id });

  // Registrar transacción de creación de tanda
  await TransactionRepository.insert(new Transaction({
    accountId: cuenta.id,
    type: TRANSACTION_TYPES.TANDA_APORTE, // could be considered a "creation" event
    amount: pozoInicial,
    description: `Creación de tanda "${nombre}" con pozo inicial de ${pozoInicial} créditos`,
  }));

  return { mensaje: 'Tanda creada correctamente', tanda };
}

/** Unirse a una tanda existente como participante. */
export async function unirseTanda({ userId, tandaId }) {
  const cuenta = await AccountRepository.findByUserId(userId);
  if (!cuenta) throw new BusinessRuleViolationError('No tienes una cuenta bancaria activa');

  const miembros = await TandaRepository.unirse({ tandaId, userId: cuenta.id });

  return { mensaje: 'Te has unido a la tanda', tandaId, miembros };
}

/** Inicia el ciclo de la tanda (primera rotación del pozo).
 *  Solo el organizador puede iniciar.
 */
export async function iniciarCicloTanda({ tandaId, userId }) {
  const cuenta = await AccountRepository.findByUserId(userId);
  if (!cuenta) throw new BusinessRuleViolationError('No tienes una cuenta bancaria activa');

  // Verificar que el usuario es organizador de la tanda
  const tanda = await TandaRepository.findById(tandaId);
  if (!tanda) throw new BusinessRuleViolationError('Tanda no encontrada');

  const miembros = await TandaRepository.findMembers(tandaId);
  const esOrganizador = miembros.some(m => m.role === 'ORGANIZADOR' && m.userId === Number(cuenta.id));
  if (!esOrganizador) throw new BusinessRuleViolationError('Solo el organizador puede iniciar el ciclo');

  await TandaRepository.iniciarCiclo({ tandaId });

  return { mensaje: 'Ciclo de tanda iniciado', tanda };
}