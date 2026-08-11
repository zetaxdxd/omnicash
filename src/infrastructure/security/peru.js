/**
 * OmniCash - Infraestructura
 * Utilidades bancarias peruanas: validación de DNI con dígito verificador
 * y generación de números de cuenta tipo CCI (Clave de Cuenta Interbancaria).
 *
 * - DNI: 8 dígitos + dígito verificador (algoritmo oficial del RENIEC,
 *   pesos 3,2,7,6,5,4,3,2, módulo 11).
 * - CCI: 20 dígitos = 3 (banco) + 5 (agencia) + 10 (cuenta) + 2 (verificadores),
 *   con el mismo esquema de pesos 2,3,4,5,6,7 de derecha a izquierda
 *   que usan los bancos peruanos (BCRP/SBS).
 */

import { config } from '../config.js';

/** Pesos del dígito verificador del DNI (RENIEC) */
const DNI_WEIGHTS = [3, 2, 7, 6, 5, 4, 3, 2];

/**
 * Calcula el dígito verificador de un DNI de 8 dígitos.
 * @param {string} ochoDigitos Los 8 dígitos del DNI
 * @returns {string} Verificador: dígito (0-9) o letra K
 */
export function calcularDvDni(ochoDigitos) {
  const digitos = String(ochoDigitos).split('').map(Number);
  const suma = digitos.reduce((acc, digito, i) => acc + digito * DNI_WEIGHTS[i], 0);
  const resto = suma % 11;
  const calculado = 11 - resto;
  if (calculado === 11) return '0';
  if (calculado === 10) return 'K';
  return String(calculado);
}

/**
 * Valida un número de DNI peruano (8 dígitos + dígito de verificación).
 * El dígito verificador puede ser un número del 0 al 9 o la letra K.
 * @param {string} dni DNI de 9 caracteres (8 dígitos + verificador)
 * @returns {boolean} true si el DNI es válido
 */
export function validarDni(dni) {
  const texto = String(dni ?? '').trim().toUpperCase();
  if (!/^\d{8}[0-9K]$/.test(texto)) return false;
  return calcularDvDni(texto.slice(0, 8)) === texto[8];
}

/**
 * Normaliza un DNI: acepta 8 dígitos (calcula el verificador RENIEC)
 * o los 9 con verificador (lo valida).
 * @param {string} dni
 * @returns {string|null} DNI normalizado de 9 caracteres, o null si es inválido
 */
export function normalizarDni(dni) {
  const texto = String(dni ?? '').trim().toUpperCase();
  if (/^\d{8}$/.test(texto)) return texto + calcularDvDni(texto);
  if (/^\d{8}[0-9K]$/.test(texto)) return validarDni(texto) ? texto : null;
  return null;
}

/**
 * Calcula UN dígito verificador con la serie de pesos 2,3,4,5,6,7
 * aplicada de derecha a izquierda sobre la cadena (módulo 11).
 * Es el algoritmo usado para los 2 dígitos de control de la CCI peruana.
 * @param {string} digitos Cadena de dígitos (sin los verificadores)
 * @returns {string} Dígito verificador (si el cálculo da 11 se usa 0, si da 10 se usa 1)
 */
export function calcularDigitoVerificador(digitos) {
  const serie = [2, 3, 4, 5, 6, 7];
  let suma = 0;
  let serieIndex = 0;
  for (let i = digitos.length - 1; i >= 0; i--) {
    suma += Number(digitos[i]) * serie[serieIndex % serie.length];
    serieIndex++;
  }
  const resto = suma % 11;
  let dv = 11 - resto;
  if (dv === 11) dv = 0;
  if (dv === 10) dv = 1;
  return String(dv);
}

/**
 * Genera un número de cuenta de 20 dígitos tipo CCI:
 * banco (3) + agencia (5) + cuenta (10) + verificadores (2).
 * @param {string} [cuentaNumerica] 10 dígitos opcionales (si no, se generan aleatorios)
 * @returns {string} CCI de 20 dígitos
 */
export function generarCci(cuentaNumerica = null) {
  const cuenta = cuentaNumerica ?? String(Math.floor(Math.random() * 1e10)).padStart(10, '0');
  const base = `${config.bankCode}${config.bankAgency}${cuenta}`;
  const verificadores = calcularDigitoVerificador(base) + calcularDigitoVerificador(base + calcularDigitoVerificador(base));
  return `${base}${verificadores}`;
}

/**
 * Valida la estructura y los dígitos de verificación de una CCI.
 * @param {string} cci Número de 20 dígitos
 * @returns {boolean} true si la CCI es válida
 */
export function validarCci(cci) {
  const texto = String(cci ?? '').trim();
  if (!/^\d{20}$/.test(texto)) return false;
  const base = texto.slice(0, 18);
  const verificadores = texto.slice(18, 20);
  const calculados = calcularDigitoVerificador(base) + calcularDigitoVerificador(base + calcularDigitoVerificador(base));
  return calculados === verificadores;
}