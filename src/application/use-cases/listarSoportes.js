/**
 * OmniCash - Aplicación
 * Caso de uso: Listar el equipo de soporte (trabajadores ACTIVOS).
 * Los clientes ven a los soportes en el modal de ayuda y pueden
 * contactarlos directamente por WhatsApp (enlace wa.me).
 */

import { UserRepository } from '../../infrastructure/repositories/UserRepository.js';

/**
 * Devuelve el equipo de soporte con su contacto de WhatsApp.
 * Solo se expone el nombre y el número: los datos KYC del trabajador
 * (DNI, apellidos, correo) son internos del banco.
 * @returns {object} {soportes: [{id, name, whatsapp}]}
 */
export async function listarSoportes() {
  const trabajadores = await UserRepository.findAll({ role: 'TRABAJADOR', limit: 100 });
  const soportes = trabajadores
    .filter((t) => t.isActivo)
    .map((t) => ({
      id: t.id,
      name: t.fullName,
      whatsapp: t.whatsapp ?? '',
    }));
  return { soportes };
}
