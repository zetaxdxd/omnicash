/**
 * OmniCash - Infraestructura
 * Cliente de Mercado Pago (QR en punto de venta).
 *
 * El cliente de OmniCash recarga con dinero real escaneando un QR de
 * Mercado Pago con su app Yape (las billeteras interoperables aceptan
 * los QR de MP). Mercado Pago notifica al webhook cuando el pago se
 * acredita y OmniCash abona automáticamente la cuenta del cliente.
 */

import { config } from '../config.js';
import QRCode from 'qrcode';

const API_MP = 'https://api.mercadopago.com';

/**
 * Cabeceras de autenticación del vendedor.
 * @returns {object} Cabeceras Authorization con el Access Token
 */
function headers() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.mpAccessToken}`,
  };
}

/**
 * ID del vendedor (collector): primero se usa el configurado y, si hace
 * falta, se consulta a la API con el Access Token.
 */
export async function obtenerUserIdVendedor() {
  if (config.mpUserId) return String(config.mpUserId);
  const res = await fetch(`${API_MP}/users/me`, { headers: headers() });
  if (!res.ok) throw new Error('No se pudo validar el Access Token de Mercado Pago');
  const datos = await res.json();
  return String(datos.id);
}

/**
 * Genera un link de pago (checkout preference) por cada recarga y devuelve
 * un QR (PNG data URL) de ese link. Funciona en cuentas personales de MP
 * (no requiere punto de venta / instore QR). Mercado Pago notifica el pago
 * por webhook y OmniCash lo acredita automáticamente.
 *
 * @param {object} input {userId, depositId, amount}
 * @returns {object} {inStoreOrderId, qrData, externalReference}
 */
export async function generarQr({ userId, depositId, amount }) {
  const externalReference = `oc-dep-${depositId}`;

  const res = await fetch(`${API_MP}/checkout/preferences`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      items: [{
        title: `Recarga OmniCash ${amount} S/`,
        description: `Recarga de ${amount} soles a tu cuenta OmniCash`,
        quantity: 1,
        unit_price: Number(amount),
        currency_id: 'PEN',
      }],
      external_reference: externalReference,
      notification_url: config.mpNotificationUrl,
    }),
  });

  if (!res.ok) {
    const detalle = await res.text().catch(() => '');
    throw new Error(`Mercado Pago rechazó el link de pago (${res.status}): ${detalle.slice(0, 200)}`);
  }

  const datos = await res.json();
  if (!datos.init_point) {
    throw new Error('Mercado Pago no devolvió el link de pago');
  }

  const qrData = await QRCode.toDataURL(datos.init_point, {
    width: 320,
    margin: 2,
    color: { dark: '#1b1b1b', light: '#ffffff' },
  });

  return {
    inStoreOrderId: datos.id,
    qrData,
    externalReference,
  };
}

/**
 * Consulta un pago de Mercado Pago por su ID (fuente de verdad).
 * El webhook solo aporta el ID; la verificación se hace aquí.
 *
 * @param {string|number} paymentId
 * @returns {object|null} {id, status, amount, externalReference, payer}
 */
export async function obtenerPago(paymentId) {
  const res = await fetch(`${API_MP}/v1/payments/${String(paymentId)}`, { headers: headers() });
  if (!res.ok) return null;
  const p = await res.json();
  return {
    id: String(p.id),
    status: p.status,
    statusDetail: p.status_detail,
    amount: Number(p.transaction_amount),
    externalReference: p.external_reference,
    payerEmail: p.payer?.email ?? null,
  };
}