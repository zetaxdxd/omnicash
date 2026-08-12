/**
 * OmniCash - Aplicación
 * Caso de uso: Listar el equipo de soporte (trabajadores ACTIVOS).
 * Los clientes ven a los soportes en el modal de ayuda y pueden
 * contactarlos directamente por WhatsApp (enlace wa.me).
 */

import { UserRepository } from '../../infrastructure/repositories/UserRepository.js';

/**
 * Devuelve el equipo de soporte con sus datos de contacto públicos.
 * @returns {object} {soportes: [{id, name, email, whatsapp}]}
 */
export async function listarSoportes() {
  const trabajadores = await UserRepository.findAll({ role: 'TRABAJADOR', limit: 100 });
  const soportes = trabajadores
    .filter((t) => t.isActivo)
    .map((t) => ({
      id: t.id,
      name: t.fullName,
      email: t.email,
      whatsapp: t.whatsapp ?? '',
    }));
  return { soportes };
}
