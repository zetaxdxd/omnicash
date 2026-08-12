/**
 * OmniCash - Infraestructura
 * Consulta de identidad contra RENIEC (vía API de terceros configurada).
 *
 * ADVERTENCIA: RENIEC no ofrece API pública a personas naturales. Esta
 * integración usa proveedores informales (ej. apis.net.pe) que requieren
 * un token comercial propio. Es una validación AUXILIAR en desarrollo;
 * un banco con convenio debe usar el servicio oficial (SVI) de RENIEC.
 *
 * Sin token configurado: modo OFFLINE (se devuelve null y el registro
 * funciona con entrada manual, ideal para desarrollo/backup).
 */

import { config } from '../config.js';

/** Normaliza el texto para comparar sin tildes ni mayúsculas */
function normalizar(texto) {
  return String(texto ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/** Nombres buscados en la respuesta según el proveedor (formato variado) */
function extraer(objeto) {
  return {
    nombres: objeto.nombres ?? objeto.names ?? objeto.first_name ?? null,
    apellidoPaterno: objeto.apellido_paterno ?? objeto.apellidoPaterno ?? objeto.father_last_name ?? objeto.first_last_name ?? null,
    apellidoMaterno: objeto.apellido_materno ?? objeto.apellidoMaterno ?? objeto.mother_last_name ?? objeto.second_last_name ?? null,
  };
}

/**
 * Consulta RENIEC por DNI (8 dígitos; el verificador se calcula aparte).
 * @param {string} dni 8 dígitos
 * @returns {Promise<{nombres, apellidoPaterno, apellidoMaterno}|null>}
 *          null en modo offline o si el proveedor no responde.
 */
export async function consultarDni(dni) {
  const { reniecApiUrl, reniecToken } = config;
  if (!reniecApiUrl || !reniecToken) return null; // modo offline

  try {
    const url = new URL(reniecApiUrl);
    url.searchParams.set('numero', dni);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${reniecToken}` },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) {
      // Algunos proveedores aceptan el token como query param en vez de header
      url.searchParams.set('token', reniecToken);
      const res2 = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!res2.ok) return null;
      return extraer(await res2.json());
    }

    const datos = await res.json();
    const identidad = extraer(datos);
    if (!identidad.nombres || !identidad.apellidoPaterno) return null;
    return identidad;
  } catch {
    return null; // sin red o proveedor caído: no bloqueamos el registro
  }
}

/**
 * Verifica que los datos escritos por el cliente coincidan con RENIEC.
 * @param {object} reniet Identidad devuelta por consultarDni
 * @param {object} escrito {nombres, apellidoPaterno, apellidoMaterno}
 * @returns {boolean}
 */
export function identidadCoincide(reniet, escrito) {
  const a = (x) => normalizar(x);
  return a(reniet.nombres) === a(escrito.nombres)
    && a(reniet.apellidoPaterno) === a(escrito.apellidoPaterno)
    && a(reniet.apellidoMaterno) === a(escrito.apellidoMaterno);
}