/**
 * OmniCash - Infraestructura
 * Cliente de Culqi para recargas con billeteras móviles (Yape/Plin) vía
 * Órdenes de Pago (Billeteras móviles).
 *
 * El banco crea una Order por monto; el frontend muestra el QR con Culqi
 * Checkout y el cliente paga escaneando con su billetera. Culqi notifica el
 * pago por webhook (order.status.changed) y OmniCash acredita el saldo solo.
 *
 * API real (verificada en docs.culqi.com):
 *   POST   https://api.culqi.com/v2/orders   -> crea la orden
 *   GET    https://api.culqi.com/v2/orders/:id -> fuente de verdad (webhook)
 * Auth: Bearer con la llave secreta (sk_...).
 */

import { config } from '../config.js';
import crypto from 'node:crypto';

const API = 'https://api.culqi.com/v2';

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.culqiSecretKey}`,
  };
}

/**
 * Crea una orden de pago para billeteras móviles (Yape).
 * @param {object} input
 * @returns {object} orden Culqi { id, state, ... }
 */
export async function crearOrdenYape({ montoSoles, descripcion, orderNumber, cliente, expirationDateSec, metadata }) {
  const res = await fetch(`${API}/orders`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      amount: Math.round(Number(montoSoles) * 100), // Culqi usa centavos
      currency_code: 'PEN',
      description,
      order_number: orderNumber,
      client_details: {
        first_name: cliente.firstName,
        last_name: cliente.lastName,
        email: cliente.email,
        phone_number: cliente.phone,
      },
      expiration_date: expirationDateSec,
      confirm: true,
      payment_methods: { billetera: true },
      metadata,
    }),
  });

  if (!res.ok) {
    const detalle = await res.text().catch(() => '');
    throw new Error(`Culqi rechazó la orden (${res.status}): ${detalle.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * Consulta una orden en Culqi (fuente de verdad para el webhook).
 * @param {string} orderId
 * @returns {object|null} { id, state, amount, ... }
 */
export async function obtenerOrden(orderId) {
  const res = await fetch(`${API}/orders/${String(orderId)}`, { headers: authHeaders() });
  if (!res.ok) return null;
  return res.json();
}

/**
 * Verifica la firma del webhook de Culqi (NO bloqueante: la fuente de verdad
 * es re-consultar la orden). Acepta el formato "t=...,v1=<hmac>" y un hash
 * directo en x-culqi-signature.
 */
export function verificarFirmaCulqi(rawBody, header) {
  if (!config.culqiWebhookSecret || !header) return { presente: false, valido: false };
  const computed = crypto.createHmac('sha256', config.culqiWebhookSecret).update(rawBody).digest('hex');
  const h = String(header).trim();
  if (h.includes('v1=')) {
    const v1 = h.split(',')
      .map((p) => p.trim())
      .find((p) => p.startsWith('v1='))
      ?.split('=')[1];
    return { presente: true, valido: v1 === computed };
  }
  return { presente: true, valido: h === computed };
}
