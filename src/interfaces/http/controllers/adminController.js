/**
 * OmniCash - Interfaces HTTP
 * Controlador de administración:
 * - Dashboard con métricas globales (solo ADMIN).
 * - Gestión de estados de usuarios (solo ADMIN).
 * - Crear trabajadores (solo ADMIN).
 * - Eliminar clientes (solo ADMIN).
 * - Panel de soporte de trabajadores (ADMIN y TRABAJADOR).
 */

import { obtenerDashboardAdmin } from '../../../application/use-cases/obtenerDashboardAdmin.js';
import { obtenerAuditoria } from '../../../application/use-cases/obtenerAuditoria.js';
import { cambiarEstadoUsuario, crearTrabajador, eliminarUsuario } from '../../../application/use-cases/gestionUsuarios.js';
import { listarClientesParaTrabajador } from '../../../application/use-cases/panelTrabajador.js';
import { autorizarDepositoYape, YAPE_CONFIRM_PURPOSE } from '../../../application/use-cases/autorizarDepositoYape.js';
import { finalizarDepositoYape } from '../../../application/use-cases/finalizarDepositoYape.js';
import { completarRetiroRedCajero } from '../../../application/use-cases/completarRetiroRedCajero.js';
import { YapeDepositRepository } from '../../../infrastructure/repositories/YapeDepositRepository.js';

/** GET /api/admin/dashboard — métricas globales del banco */
export async function dashboard(req, res, next) {
  try {
    res.json(await obtenerDashboardAdmin());
  } catch (error) {
    next(error);
  }
}

/** GET /api/admin/auditoria — registro de auditoría en bloques (solo ADMIN) */
export async function auditoria(req, res, next) {
  try {
    res.json(await obtenerAuditoria());
  } catch (error) {
    next(error);
  }
}

/** POST /api/admin/usuarios/:id/estado — bloquear/desbloquear */
export async function cambiarEstado(req, res, next) {
  try {
    const { estado } = req.body ?? {};
    const resultado = await cambiarEstadoUsuario({
      targetUserId: Number(req.params.id),
      nuevoEstado: estado,
      autorRole: req.usuario.role,
      autorId: req.usuario.id,
    });
    res.json({ mensaje: 'Estado actualizado', ...resultado });
  } catch (error) {
    next(error);
  }
}

/** POST /api/admin/trabajadores — crear un trabajador */
export async function crearEmpleado(req, res, next) {
  try {
    const { name, email, password, whatsapp, dni, apellidoPaterno, apellidoMaterno, nombres } = req.body ?? {};
    const resultado = await crearTrabajador({
      name, email, password, whatsapp, dni, apellidoPaterno, apellidoMaterno, nombres,
      autorRole: req.usuario.role,
      autorId: req.usuario.id,
    });
    res.status(201).json({ mensaje: 'Trabajador creado', ...resultado });
  } catch (error) {
    next(error);
  }
}

/** DELETE /api/admin/usuarios/:id — eliminar cliente */
export async function eliminar(req, res, next) {
  try {
    const resultado = await eliminarUsuario({
      targetUserId: Number(req.params.id),
      autorRole: req.usuario.role,
      autorId: req.usuario.id,
    });
    res.json({ mensaje: 'Usuario eliminado', ...resultado });
  } catch (error) {
    next(error);
  }
}

/** GET /api/admin/clientes — lista de clientes para soporte (admin y trabajador) */
export async function listarClientes(req, res, next) {
  try {
    res.json({ clientes: await listarClientesParaTrabajador() });
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------
// RETIRO SIN TARJERA RED (admin)
// ---------------------------------------------------

/** POST /api/admin/cajero/retiro/:withdrawalId/completar — confirma un retiro en cajero (staff) */
export async function completarRetiroRedCajeroAdmin(req, res, next) {
  try {
    const { withdrawalId } = req.params;
    const { codigoPlain } = req.body ?? {};
    if (!codigoPlain) return res.status(400).json({ error: 'Falta el código plano' });
    const resultado = await completarRetiroRedCajero({
      withdrawalId: Number(withdrawalId),
      codigoPlain,
      confirmUserId: req.usuario.id,
    });
    res.json({ mensaje: 'Retiro completado', ...resultado });
  } catch (error) {
    next(error);
  }
}

/** GET /api/admin/cajero/retiros-pendientes — lista retiros pending para confirmar (admin) */
export async function listarRetirosPendientesAdmin(req, res, next) {
  try {
    const retiros = await completarRetiroRedCajero.listarRetirosPendientes ? await completarRetiroRedCajero.listarRetirosPendientes() : [];
    // fallback: use AtmRepository directly if function not exposed
    res.json({ retiros });
  } catch (error) {
    next(error);
  }
}

// ---------------- Depósitos Yape (dinero real) ----------------

/** GET /api/admin/yape/pendientes — solicitudes por confirmar (solo admin) */
export async function yapePendientes(req, res, next) {
  try {
    res.json({ depositos: await YapeDepositRepository.listarPendientes() });
  } catch (error) {
    next(error);
  }
}

/** POST /api/admin/yape/:id/autorizar — contraseña del admin y envía el OTP */
export async function yapeAutorizar(req, res, next) {
  try {
    const { password } = req.body ?? {};
    const resultado = await autorizarDepositoYape({
      adminUserId: req.usuario.id,
      depositId: Number(req.params.id),
      password,
    });
    res.json({ mensaje: 'Revisa tu correo: te enviamos el código de confirmación', ...resultado });
  } catch (error) {
    next(error);
  }
}

/** POST /api/admin/yape/:id/finalizar — valida el OTP y acredita o rechaza */
export async function yapeFinalizar(req, res, next) {
  try {
    const { codigo, accion } = req.body ?? {};
    const resultado = await finalizarDepositoYape({
      adminUserId: req.usuario.id,
      depositId: Number(req.params.id),
      codigo,
      accion,
    });
    const mensaje = resultado.estado === 'ACREDITADO'
      ? 'Depósito acreditado: el saldo del cliente fue actualizado'
      : 'Depósito rechazado';
    res.json({ mensaje, ...resultado });
  } catch (error) {
    next(error);
  }
}