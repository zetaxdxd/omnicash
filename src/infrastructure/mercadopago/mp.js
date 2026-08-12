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
 * Genera (o reemplaza) el QR dinámico de una caja: cada recarga del
 * cliente usa su propia caja (`oc-<userId>`) y su propio QR.
 *
 * @param {object} input {userId, depositId, amount}
 * @returns {object} {inStoreOrderId, qrData, externalReference}
 */
export async function generarQr({ userId, depositId, amount }) {
  const collectorId = await obtenerUserIdVendedor();
  const posId = `oc-${userId}`;
  const externalReference = `oc-dep-${depositId}`;

  const res = await fetch(
    `${API_MP}/instore/orders/qr/seller/collectors/${collectorId}/pos/${posId}/qrs`,
    {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        external_reference: externalReference,
        notification_url: config.mpNotificationUrl,
        title: `Recarga OmniCash ${amount} S/`,
        description: `Recarga de ${amount} soles a tu cuenta OmniCash`,
        total_amount: Number(amount),
        items: [{
          title: 'Recarga de créditos',
          description: `Abono de ${amount} soles a tu cuenta OmniCash`,
          quantity: 1,
          unit_price: Number(amount),
          total_amount: Number(amount),
        }],
      }),
    }
  );

  if (!res.ok) {
    const detalle = await res.text().catch(() => '');
    throw new Error(`Mercado Pago rechazó el QR (${res.status}): ${detalle.slice(0, 200)}`);
  }

  const datos = await res.json();
  if (!datos.qr_data) {
    throw new Error('Mercado Pago no devolvió el QR. Revisa la configuración de la cuenta');
  }

  return {
    inStoreOrderId: datos.in_store_order_id,
    qrData: datos.qr_data,
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