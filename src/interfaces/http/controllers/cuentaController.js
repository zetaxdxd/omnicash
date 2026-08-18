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
import { solicitarRecargaQr, acreditarRecargaQr, expirarRecargaQr } from '../../../application/use-cases/recargaQr.js';
import { solicitarRecargaCulqi, acreditarRecargaCulqi, expirarRecargaCulqi } from '../../../application/use-cases/recargaYapeCulqi.js';
import { verificarFirmaCulqi } from '../../../infrastructure/culqi/culqi.js';
import { RecargaCulqiRepository } from '../../../infrastructure/repositories/RecargaCulqiRepository.js';
import { obtenerPago } from '../../../infrastructure/mercadopago/mp.js';
import QRCode from 'qrcode';
import { config } from '../../../infrastructure/config.js';
import crypto from 'node:crypto';
import { YapeDepositRepository } from '../../../infrastructure/repositories/YapeDepositRepository.js';
import { AtmRepository } from '../../../infrastructure/repositories/AtmRepository.js';
import { solicitarRetiroRedCajero as solicitarRetiroRedCajeroUseCase } from '../../../application/use-cases/solicitarRetiroRedCajero.js';
import { iniciarCicloTanda as iniciarCicloTandaUseCase, unirseTanda as unirseTandaUseCase, crearTanda as crearTandaUseCase } from '../../../application/use-cases/tanda.js';

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

/** POST /api/cuenta/cajero/retiro — solicitar retiro sin tarjeta en la red OmniCash */
export async function solicitarRetiroRedCajero(req, res, next) {
  try {
    const { monto } = req.body ?? {};
    const { atmId } = req.body ?? {};
    const resultado = await solicitarRetiroRedCajeroUseCase({ userId: req.usuario.id, monto, atmId });
    res.status(201).json({ mensaje: 'Solicitud de retiro en cajero generada', ...resultado });
  } catch (error) {
    next(error);
  }
}

/** GET /api/cuenta/cajeros — lista cajeros aliados de la red (solo lectura) */
export async function listarCajerosAliados(req, res, next) {
  try {
    const cajeros = await AtmRepository.listarCajeros();
    res.json({ cajeros });
  } catch (error) {
    next(error);
  }
}

/** GET /api/cuenta/retiros-cajero — historial de retiros en cajero del cliente */
export async function historialRetirosCliente(req, res, next) {
  try {
    const { limite = 20 } = req.query;
    const historial = await AtmRepository.historialCliente(req.usuario.id, Number(limite));
    res.json({ historial });
  } catch (error) {
    next(error);
  }
}

/** GET /api/cuenta/rentabilidad — monto de interés ganado hoy */
export async function rentabilidad(req, res, next) {
  try {
    const { interesDelDia } = await aplicarRentabilidadDiaria({ accountId: req.usuario.id });
    res.json({ interesDelDia });
  } catch (error) {
    next(error);
  }
}

/** POST /api/cuenta/alcancia — crear una nueva alcancia (meta de ahorro) */
export async function crearAlcancia(req, res, next) {
  try {
    const { nombre, objetivo } = req.body ?? {};
    if (!nombre || !objetivo) return res.status(400).json({ error: 'Faltan nombre u objetivo' });
    const resultado = await crearAlcancia({ userId: req.usuario.id, nombre, objetivo, accountId: req.usuario.id });
    res.status(201).json({ mensaje: 'Alcancia creada', ...resultado });
  } catch (error) {
    next(error);
  }
}

/** POST /api/cuenta/alcancia/aportar — aportar dinero a una alcancia */
export async function aportarAlcancia(req, res, next) {
  try {
    const { goalId, monto } = req.body ?? {};
    if (!goalId || !monto) return res.status(400).json({ error: 'Faltan goalId u monto' });
    const resultado = await aportarAlcancia({ goalId: Number(goalId), monto: Number(monto) });
    res.json({ mensaje: 'Aportación registrada', ...resultado });
  } catch (error) {
    next(error);
  }
}

/** POST /api/cuenta/alcancia/retirar — retirar dinero de una alcancia */
export async function sacarDeAlcancia(req, res, next) {
  try {
    const { goalId, monto } = req.body ?? {};
    if (!goalId || !monto) return res.status(400).json({ error: 'Faltan goalId u monto' });
    const resultado = await sacarDeAlcancia({ goalId: Number(goalId), monto: Number(monto) });
    res.json({ mensaje: 'Retiro completado', ...resultado });
  } catch (error) {
    next(error);
  }
}

/** POST /api/cuenta/tanda — crear una nueva tanda */
export async function crearTanda(req, res, next) {
  try {
    const { nombre, pozoInicial } = req.body ?? {};
    if (!nombre || !pozoInicial) return res.status(400).json({ error: 'Faltan nombre o pozoInicial' });
    const resultado = await crearTandaUseCase({ userId: req.usuario.id, nombre, pozoInicial });
    res.status(201).json({ mensaje: 'Tanda creada', ...resultado });
  } catch (error) {
    next(error);
  }
}

/** POST /api/cuenta/tanda/unirse — unirse a una tanda */
export async function unirseTanda(req, res, next) {
  try {
    const { tandaId } = req.body ?? {};
    if (!tandaId) return res.status(400).json({ error: 'Faltan tandaId' });
    const resultado = await unirseTandaUseCase({ userId: req.usuario.id, tandaId: Number(tandaId) });
    res.json({ mensaje: 'Te has unido a la tanda', ...resultado });
  } catch (error) {
    next(error);
  }
}

/** POST /api/cuenta/tanda/iniciar-ciclo — iniciar el ciclo de la tanda */
export async function iniciarCicloTanda(req, res, next) {
  try {
    const { tandaId } = req.body ?? {};
    if (!tandaId) return res.status(400).json({ error: 'Faltan tandaId' });
    const resultado = await iniciarCicloTandaUseCase({ tandaId: Number(tandaId), userId: req.usuario.id });
    res.json({ mensaje: 'Ciclo de tanda iniciado', ...resultado });
  } catch (error) {
    next(error);
  }
}

/** POST /api/cuenta/recarga-qr — genera el QR de Mercado Pago para recargar */
export async function recargaQr(req, res, next) {
  try {
    const { monto } = req.body ?? {};
    const resultado = await solicitarRecargaQr({ userId: req.usuario.id, monto });
    res.status(201).json({ mensaje: 'Escanea el QR con tu Yape para pagar', ...resultado });
  } catch (error) {
    next(error);
  }
}

/** GET /api/cuenta/recarga-qr/:id — estado de una recarga por QR */
export async function estadoRecargaQr(req, res, next) {
  try {
    const dep = await YapeDepositRepository.findById(Number(req.params.id));
    if (!dep || dep.userId !== req.usuario.id) {
      return res.status(404).json({ error: 'Recarga no encontrada' });
    }
    res.json({ estado: dep.state, saldo: null });
  } catch (error) {
    next(error);
  }
}

/** POST /api/cuenta/recarga-qr/:id/expirar — deshace el QR tras su temporizador */
export async function vencerRecargaQr(req, res, next) {
  try {
    const resultado = await expirarRecargaQr({ userId: req.usuario.id, depositId: Number(req.params.id) });
    res.json({ mensaje: 'Recarga expirada', ...resultado });
  } catch (error) {
    next(error);
  }
}

/** GET /api/cuenta/yape-comercio — datos y QR del Yape del banco para recargas manuales */
export async function yapeComercio(req, res, next) {
  try {
    const alias = (config.yapeMerchantAlias || '').trim();
    const phone = (config.yapeMerchantPhone || '').trim();
    const name = config.yapeMerchantName || 'OmniCash';
    let qr = null;
    if (alias) {
      qr = await QRCode.toDataURL(`https://yape.me/${encodeURIComponent(alias)}`, {
        width: 240, margin: 1, color: { dark: '#1b1b1b', light: '#ffffff' },
      });
    }
    res.json({ name, phone, alias: alias || null, qr });
  } catch (error) {
    next(error);
  }
}

/**
 * Verifica la firma `x-signature` de Mercado Pago (defensa en profundidad).
 * La fuente de verdad SIEMPRE es consultar el pago a MP; esta firma solo
 * alerta si la notificación no viene de MP. Por ahora es NO-bloquear: si la
 * firma no cuadra se audita la anomalía (log) pero se sigue verificando el
 * pago contra MP. Una vez confirmado con una notificación real, se puede
 * volver bloqueante.
 */
function verificarFirmaMP(req, paymentId) {
  const xSignature = req.headers['x-signature'];
  const xRequestId = req.headers['x-request-id'];
  if (!xSignature || !xRequestId) return { presente: false, valido: false };
  let ts, hash;
  for (const part of String(xSignature).split(',')) {
    const [k, v] = part.split('=');
    if (k.trim() === 'ts') ts = v;
    if (k.trim() === 'v1') hash = v;
  }
  const url = new URL(req.url, 'http://localhost');
  const dataId = url.searchParams.get('data.id') ?? paymentId;
  if (!ts || !hash || !dataId) return { presente: true, valido: false };
  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
  const computed = crypto.createHmac('sha256', config.mpAccessToken).update(manifest).digest('hex');
  return { presente: true, valido: computed === hash };
}

/** GET /api/cuenta/culqi-config — expone la llave pública de Culqi al frontend */
export async function culqiConfig(req, res, next) {
  try {
    res.json({ habilitado: !!config.culqiSecretKey, publicKey: config.culqiPublicKey || null });
  } catch (error) {
    next(error);
  }
}

/** POST /api/cuenta/recarga-culqi — crea la orden Culqi y devuelve el orderId */
export async function recargaCulqi(req, res, next) {
  try {
    const { monto } = req.body ?? {};
    const resultado = await solicitarRecargaCulqi({ userId: req.usuario.id, monto });
    res.status(201).json({ mensaje: 'Escanea el QR con tu Yape para pagar', ...resultado });
  } catch (error) {
    next(error);
  }
}

/** GET /api/cuenta/recarga-culqi/:id — estado de una recarga Culqi */
export async function estadoRecargaCulqi(req, res, next) {
  try {
    const dep = await RecargaCulqiRepository.findById(Number(req.params.id));
    if (!dep || dep.userId !== req.usuario.id) {
      return res.status(404).json({ error: 'Recarga no encontrada' });
    }
    res.json({ estado: dep.state, saldo: null });
  } catch (error) {
    next(error);
  }
}

/** POST /api/cuenta/recarga-culqi/:id/expirar — deshace el QR tras su temporizador */
export async function vencerRecargaCulqi(req, res, next) {
  try {
    const resultado = await expirarRecargaCulqi({ userId: req.usuario.id, id: Number(req.params.id) });
    res.json({ mensaje: 'Recarga expirada', ...resultado });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/webhooks/culqi — notificación de pago de Culqi (order.status.changed).
 * Pública: re-consulta la orden a Culqi para verificarla (el body solo
 * aporta el id/estado) y acredita la recarga automáticamente.
 */
export async function webhookCulqi(req, res, next) {
  try {
    const firma = verificarFirmaCulqi(req.rawBody ?? JSON.stringify(req.body), req.headers['x-culqi-signature']);
    if (firma.presente && !firma.valido) {
      console.warn('[Culqi] Webhook con firma inválida');
    }

    const payload = req.body ?? {};
    const evento = payload.type || payload.event;
    if (evento !== 'order.status.changed') return res.status(200).json({ ok: true });

    const orden = payload.data?.object;
    if (!orden?.id) return res.status(200).json({ ok: true });

    if (orden.state === 'paid') {
      await acreditarRecargaCulqi({ culqiOrderId: orden.id });
    }
    res.status(200).json({ ok: true });
  } catch (error) {
    // Siempre 200 para no reenviar; el error queda auditado
    res.status(200).json({ ok: true, error: error.message });
  }
}

/**
 * POST /api/webhooks/mercadopago — notificación de pago de Mercado Pago.
 * Pública: el servidor consulta el pago a Mercado Pago para verificarlo
 * (el body solo aporta el id) y acredita la recarga automáticamente.
 */
export async function webhookMercadoPago(req, res, next) {
  try {
    const payload = req.body ?? {};
    const paymentId = payload.data?.id ?? payload.id;
    if (!paymentId) return res.status(200).json({ ok: true });

    const firma = verificarFirmaMP(req, paymentId);
    if (firma.presente && !firma.valido) {
      console.warn('[MP] Webhook con firma inválida para pago', paymentId);
    }

    const pago = await obtenerPago(paymentId);
    if (!pago) return res.status(200).json({ ok: true });
    if (pago.status !== 'approved') return res.status(200).json({ ok: true });

    await acreditarRecargaQr({
      externalReference: pago.externalReference,
      amount: pago.amount,
      paymentId: pago.id,
    });
    res.status(200).json({ ok: true });
  } catch (error) {
    // El webhook siempre responde 200 para no reenviar; el error queda auditado
    res.status(200).json({ ok: true, error: error.message });
  }
}