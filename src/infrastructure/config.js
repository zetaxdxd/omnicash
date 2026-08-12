/**
 * OmniCash - Infraestructura
 * Configuración de la aplicación: lee variables de entorno
 * y un archivo .env con valores por defecto seguros para desarrollo.
 * Sin dependencias externas: parseo manual del .env.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, '../..');

/** Carga las variables de un archivo .env en process.env (sin sobreescribir las ya definidas) */
export function loadEnvFile(envPath = path.join(PROJECT_ROOT, '.env')) {
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue; // ignora vacías y comentarios
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile();

export const config = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET ?? 'omnicash_dev_secret_cambiar_en_produccion',
  /** URL de conexión a PostgreSQL (Neon). Si está vacía se usa SQLite local. */
  databaseUrl: process.env.DATABASE_URL ?? '',
  dbPath: process.env.DB_PATH
    ? path.resolve(PROJECT_ROOT, process.env.DB_PATH)
    : path.join(PROJECT_ROOT, 'data', 'omnicash.db'),
  atmDailyLimit: Number(process.env.ATM_DAILY_LIMIT ?? 1000),
  atmFee: Number(process.env.ATM_FEE ?? 0.05),

  // Identidad del banco para numeración tipo CCI
  bankCode: process.env.BANK_CODE ?? '606',
  bankAgency: process.env.BANK_AGENCY ?? '00001',

  // Seguridad
  otpTtlMinutes: Number(process.env.OTP_TTL_MINUTES ?? 10),
  loginMaxAttempts: Number(process.env.LOGIN_MAX_ATTEMPTS ?? 5),
  loginBlockMinutes: Number(process.env.LOGIN_BLOCK_MINUTES ?? 15),
  sessionTtl: process.env.SESSION_TTL ?? '2h',
  sensitiveOperationMin: Number(process.env.SENSITIVE_OPERATION_MIN ?? 100),

  // Correo transaccional: SMTP de Brevo (o Gmail con contraseña de aplicación como respaldo)
  smtpHost: process.env.SMTP_HOST ?? '',
  smtpPort: Number(process.env.SMTP_PORT ?? 587),
  smtpUser: process.env.SMTP_USER ?? process.env.GMAIL_USER ?? '',
  smtpPassword: process.env.SMTP_PASSWORD ?? process.env.GMAIL_APP_PASSWORD ?? '',
  /** Remitente VERIFICADO en Brevo: debe ser un buzón real (ej. fernandezllanoselias@gmail.com) */
  smtpFromEmail: process.env.SMTP_FROM_EMAIL ?? process.env.GMAIL_USER ?? process.env.SMTP_USER ?? '',
  emailFrom: process.env.EMAIL_FROM ?? 'OmniCash Banco',

  // Yape real: número (celular BCP) que recibe el dinero y nombre mostrado
  yapeMerchantPhone: process.env.YAPE_MERCHANT_PHONE ?? '',
  yapeMerchantName: process.env.YAPE_MERCHANT_NAME ?? 'OmniCash',
  yapeMaxAmount: Number(process.env.YAPE_MAX_AMOUNT ?? 1000),
  yapeDailyLimit: Number(process.env.YAPE_DAILY_LIMIT ?? 3000),

  // RENIEC (consulta de identidad). Si falta el token, el sistema opera
  // en modo offline (entrada manual de datos) sin bloquear el registro.
  reniecApiUrl: process.env.RENIEC_API_URL ?? '',
  reniecToken: process.env.RENIEC_TOKEN ?? '',

  // Máximo de cuentas que puede tener una misma persona (regla RENIEC)
  maxCuentasPorDni: Number(process.env.MAX_CUENTAS_POR_DNI ?? 2),

  // Máximo de cuentas que pueden compartir un mismo correo (el correo
  // NO es único: se rechaza solo a partir de la 4ª cuenta con el mismo correo)
  maxCuentasPorCorreo: Number(process.env.MAX_CUENTAS_POR_CORREO ?? 3),
};

/** Duración de sesiones expresada en milisegundos (apoyo a config) */
function parseTtl(ttl) {
  const num = Number(String(ttl).replace(/[^0-9.]/g, ''));
  if (ttl.endsWith('d')) return num * 24 * 60 * 60 * 1000;
  if (ttl.endsWith('h')) return num * 60 * 60 * 1000;
  if (ttl.endsWith('m')) return num * 60 * 1000;
  return num * 1000;
}

/** TTL de sesión en milisegundos */
export const SESSION_TTL_MS = parseTtl(config.sessionTtl);
/** TTL de tokens temporales (reautenticación y 2FA) en milisegundos: 5 min */
export const TEMP_TTL_MS = 5 * 60 * 1000;