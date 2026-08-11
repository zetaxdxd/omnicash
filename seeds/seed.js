/**
 * OmniCash - Semilla de datos iniciales (v2).
 * Crea el ADMINISTRADOR SUPREMO con identidad verificada y una cuenta CCI.
 * El admin no pasa por el OTP de correo (cuenta institucional del banco).
 *
 * Uso: npm run seed
 */

import { UserRepository } from '../src/infrastructure/repositories/UserRepository.js';
import { AccountRepository } from '../src/infrastructure/repositories/AccountRepository.js';
import { AuditRepository } from '../src/infrastructure/repositories/AuditRepository.js';
import { PasswordService } from '../src/infrastructure/security/password.js';
import { User, ROLES } from '../src/domain/entities/User.js';
import { Account } from '../src/domain/entities/Account.js';
import { validarDni } from '../src/infrastructure/security/peru.js';

/** Credenciales del administrador supremo (¡cámbialas al entrar!) */
const ADMIN = {
  paterno: 'Fernandez',
  materno: 'Llanos',
  nombres: 'Elias',
  direccion: 'Av. Los Alamos 123 - Miraflores',
  email: 'fernandezllanoselias@gmail.com',
  password: 'Admin12345',
  dni: '731482179',       // DNI real del administrador (con dígito verificador)
  phone: '921901846',     // Yape real: ahí llega el dinero de los clientes
};

async function main() {
  const existente = await UserRepository.findByEmail(ADMIN.email);
  if (existente) {
    console.log(`[seed] El administrador ya existe: ${ADMIN.email}`);
    return;
  }

  if (!validarDni(ADMIN.dni)) {
    console.error('[seed] Error: el DNI de la semilla no pasa la validación');
    process.exit(1);
  }

  const passwordHash = await PasswordService.hash(ADMIN.password);
  const admin = new User({
    apellidoPaterno: ADMIN.paterno,
    apellidoMaterno: ADMIN.materno,
    nombres: ADMIN.nombres,
    direccion: ADMIN.direccion,
    email: ADMIN.email,
    backupEmail: ADMIN.email, // respaldo del dueño: su mismo correo (solo en seed)
    dni: ADMIN.dni,
    phone: ADMIN.phone,
    passwordHash,
    role: ROLES.ADMIN,
    emailVerified: true, // cuenta institucional: verificada por el propio banco
  });
  const guardado = await UserRepository.insert(admin);

  // El administrador también tiene cuenta bancaria (para probar transferencias)
  let cci;
  do {
    cci = Account.generarCci();
  } while (await AccountRepository.findByCci(cci));
  await AccountRepository.insert(new Account({ userId: guardado.id, cci, balance: 1000 }));

  await AuditRepository.log({
    actorId: guardado.id,
    action: 'SEED',
    detail: 'Administrador supremo creado desde la semilla (identidad verificada)',
  });

  console.log('[seed] Administrador supremo creado:');
  console.log(`  Correo:    ${ADMIN.email}`);
  console.log(`  Password:  ${ADMIN.password}`);
  console.log(`  CCI:       ${cci}`);
  console.log('  (IMPORTANTE: cambia la contraseña y activa el 2FA en Producción)');
}

main().catch(err => {
  console.error('[seed] Error:', err.message);
  process.exit(1);
});