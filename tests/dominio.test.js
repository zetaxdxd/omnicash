/**
 * OmniCash — Pruebas del dominio y módulos de seguridad bancaria.
 * Cubre las reglas de negocio críticas del banco:
 * entidades, DNI peruano, CCI de 20 dígitos, TOTP (RFC 6238) y fuerza bruta.
 * Ejecutar con: npm test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ---------- Entidades de dominio ----------
import { User, ROLES, esContrasenaFuerte } from '../src/domain/entities/User.js';
import { Account } from '../src/domain/entities/Account.js';
import { Transaction, TRANSACTION_TYPES } from '../src/domain/entities/Transaction.js';
import { BusinessRuleViolationError } from '../src/domain/errors/DomainError.js';

// ---------- Seguridad bancaria ----------
import { validarDni, generarCci, validarCci } from '../src/infrastructure/security/peru.js';
import { calcularTotp, verificarTotp, generarSecretoTotp, otpauthUri } from '../src/infrastructure/security/totp.js';
import { hashearCodigo, verificarCodigo } from '../src/infrastructure/security/otp.js';

test('Usuario: valida datos básicos', () => {
  const u = new User({ name: 'Ana', email: 'ana@mail.com', passwordHash: 'x'.repeat(10) });
  assert.equal(u.role, ROLES.CLIENTE);
  assert.equal(u.isCliente, true);
  assert.throws(() => new User({ name: '', email: 'ana@mail.com', passwordHash: 'xxxxxx' }));
  assert.throws(() => new User({ name: 'Ana', email: 'no-correo', passwordHash: 'xxxxxx' }));
});

test('Usuario: política de contraseña bancaria', () => {
  assert.equal(esContrasenaFuerte('Admin12'), false);       // muy corta (7)
  assert.equal(esContrasenaFuerte('Admin1234'), true);      // mayúscula+minúscula+número
  assert.equal(esContrasenaFuerte('admin1234'), false);     // sin mayúscula
  assert.equal(esContrasenaFuerte('ADMIN1234'), false);     // sin minúscula
  assert.equal(esContrasenaFuerte('Adminabcd'), false);     // sin número
});

test('Usuario: intentos fallidos bloquean temporalmente', () => {
  const u = new User({ name: 'Ana', email: 'ana@mail.com', passwordHash: 'x'.repeat(10) });
  for (let i = 0; i < 4; i++) {
    assert.equal(u.registrarIntentoFallido(5, 15), false);
  }
  // El quinto intento dispara el bloqueo temporal
  assert.equal(u.registrarIntentoFallido(5, 15), true);
  assert.equal(u.isLoginBlocked, true);
  assert.ok(u.loginBlockMinutesLeft > 0);
  u.reiniciarIntentosFallidos();
  assert.equal(u.isLoginBlocked, false);
});

test('Cuenta: genera CCI de 20 dígitos con verificadores válidos', () => {
  const a = Account.generarCci();
  const b = Account.generarCci();
  assert.match(a, /^\d{20}$/);
  assert.equal(validarCci(a), true);
  assert.notEqual(a, b);
});

test('Cuenta: depositar y retirar mantienen saldo correcto', () => {
  const cuenta = new Account({ userId: 1, cci: '12345678901234567890', balance: 0 });
  cuenta.depositar(100);
  assert.equal(cuenta.balance, 100);
  cuenta.retirar(40);
  assert.equal(cuenta.balance, 60);
});

test('Cuenta: NO permite sobregirar (regla crítica)', () => {
  const cuenta = new Account({ userId: 1, cci: '12345678901234567890', balance: 50 });
  assert.throws(() => cuenta.retirar(50.01), BusinessRuleViolationError);
  assert.equal(cuenta.balance, 50); // el saldo no cambia
});

test('Cuenta: rechaza montos inválidos', () => {
  const cuenta = new Account({ userId: 1, cci: '12345678901234567890', balance: 0 });
  assert.throws(() => cuenta.depositar(-5), BusinessRuleViolationError);
  assert.throws(() => cuenta.depositar(0), BusinessRuleViolationError);
  assert.throws(() => cuenta.depositar('diez'), BusinessRuleViolationError);
});

test('Cuenta: congelada no puede operar', () => {
  const cuenta = new Account({ userId: 1, cci: '12345678901234567890', balance: 500 });
  cuenta.congelar();
  assert.throws(() => cuenta.ensureOperativa(), BusinessRuleViolationError);
  cuenta.descongelar();
  assert.doesNotThrow(() => cuenta.ensureOperativa());
});

test('Transacción: valida tipo y monto', () => {
  const tx = new Transaction({
    accountId: 1,
    type: TRANSACTION_TYPES.DEPOSITO,
    amount: 10,
  });
  assert.equal(tx.amount, 10);
  assert.throws(() => new Transaction({ accountId: 1, type: 'X', amount: 10 }));
  assert.throws(() => new Transaction({ accountId: 1, type: TRANSACTION_TYPES.DEPOSITO, amount: -3 }));
});

test('Usuario: bloqueo y desbloqueo', () => {
  const u = new User({ name: 'Ana', email: 'ana@mail.com', passwordHash: 'x'.repeat(10) });
  u.bloquear();
  assert.equal(u.isActivo, false);
  u.desbloquear();
  assert.equal(u.isActivo, true);
});

// ---------- DNI peruano (dígito verificador RENIEC) ----------
test('peru: valida DNI con dígito verificador', () => {
  // DNI calculado: 40123456 + verificador K (89 → resto 1 → 11-1=10 → K)
  assert.equal(validarDni('40123456K'), true);
  assert.equal(validarDni('401234560'), false);   // verificador incorrecto
  assert.equal(validarDni('12345678'), false);    // falta el verificador
  assert.equal(validarDni('123456789'), false);   // verificador no coincide
  assert.equal(validarDni('abc'), false);
});

// ---------- CCI (clave de cuenta interbancaria peruana) ----------
test('peru: la CCI carga los dígitos verificadores del banco configurado', () => {
  const cci = generarCci('1234567890');
  assert.match(cci, /^606000011234567890?$|^\d{20}$/);
  assert.equal(cci.slice(0, 3), '606');       // código de banco configurado
  assert.equal(cci.slice(3, 8), '00001');     // agencia configurada
  assert.equal(validarCci(cci), true);
});

test('peru: rechaza CCI con verificadores alterados', () => {
  const cci = generarCci('1234567890');
  const alterada = cci.slice(0, 19) + (cci[19] === '0' ? '1' : '0');
  assert.equal(validarCci(alterada), false);
  assert.equal(validarCci('12345'), false);
  assert.equal(validarCci('abcdefghijklmnopqrst'), false);
});

// ---------- TOTP (RFC 6238, vector oficial) ----------
test('totp: reproduce el vector de prueba oficial RFC 6238', () => {
  // Secreto = "12345678901234567890" codificado en ASCII base32
  const secreto = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
// T=59 segundos desde la época (contador 1)
  assert.equal(calcularTotp(secreto, 59_000), '287082');
  // En el instante 1111111109 (contador 37037036) → 6 últimos dígitos de 07081804
  assert.equal(calcularTotp(secreto, 1_111_111_109_000), '081804');
  // En el instante 2000000000 → 6 últimos dígitos de 69279037
  assert.equal(calcularTotp(secreto, 2_000_000_000_000), '279037');
});

test('totp: genera secretos únicos y verifica códigos actuales', () => {
  const s1 = generarSecretoTotp();
  const s2 = generarSecretoTotp();
  assert.notEqual(s1, s2);
  assert.match(s1, /^[A-Z2-7]{32}$/);
  const codigo = calcularTotp(s1, Date.now());
  assert.match(codigo, /^\d{6}$/);
  assert.equal(verificarTotp(codigo, s1), true);
  assert.equal(verificarTotp('000000', s1), false);
});

test('totp: genera URI otpauth para apps de autenticación', () => {
  const uri = otpauthUri('ABCDEFGH', 'cliente@mail.com');
  assert.match(uri, /^otpauth:\/\/totp\//);
  assert.ok(uri.includes('issuer=OmniCash'));
  assert.ok(uri.includes('secret=ABCDEFGH'));
});

// ---------- OTP de correo (hash + verificación) ----------
test('otp: solo verifica el código con su propio hash', () => {
  const { hash, salt } = hashearCodigo('123456');
  assert.equal(verificarCodigo('123456', `${salt}:${hash}`), true);
  assert.equal(verificarCodigo('654321', `${salt}:${hash}`), false);
  assert.equal(verificarCodigo('123456', 'sin-salt:malo'), false);
});

// ---------- Errores de dominio ----------
test('DomainError: transporta código de estado HTTP', () => {
  const err = new BusinessRuleViolationError('mensaje');
  assert.equal(err.statusCode, 422);
  assert.equal(err.isOperational, true);
});