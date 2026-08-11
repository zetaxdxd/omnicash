/**
 * OmniCash - Dominio
 * Entidad Usuario: una persona que usa el banco (cliente, trabajador o administrador).
 * Contiene las reglas de validación y la lógica de negocio del usuario,
 * independiente de la base de datos o del framework web.
 *
 * v2: datos de identidad completos tipo KYC bancario (apellido paterno,
 * materno, nombres y dirección), verificación de correo obligatoria,
 * segundo factor (TOTP) y control de fuerza bruta.
 */

/** Roles que existen en el banco OmniCash */
export const ROLES = Object.freeze({
  ADMIN: 'ADMIN',             // Administrador supremo: control total del banco
  TRABAJADOR: 'TRABAJADOR',   // Empleado del banco: soporte y operaciones
  CLIENTE: 'CLIENTE',         // Cliente: usa su cuenta y hace transferencias
});

/** Estados posibles de la cuenta de un usuario */
export const USER_STATES = Object.freeze({
  ACTIVO: 'ACTIVO',           // Puede operar con normalidad
  BLOQUEADO: 'BLOQUEADO',     // Bloqueado por el administrador (por seguridad o infracción)
});

/** Longitud mínima de contraseña (estándar de seguridad mínima) */
export const MIN_PASSWORD_LENGTH = 8;

/** Formato de teléfono peruano: 9 dígitos empezando en 9 */
const PHONE_REGEX = /^9\d{8}$/;

/**
 * Valida la política de contraseña bancaria:
 * mínimo 8 caracteres, al menos una mayúscula, una minúscula y un dígito.
 * @param {string} contraseña
 * @returns {boolean}
 */
export function esContrasenaFuerte(contraseña) {
  if (typeof contraseña !== 'string' || contraseña.length < MIN_PASSWORD_LENGTH) return false;
  return /[A-Z]/.test(contraseña) && /[a-z]/.test(contraseña) && /\d/.test(contraseña);
}

/** Máscara del teléfono en datos públicos (solo 3 primeros dígitos) */
const MASK_PHONE = (p) => (p ? p.slice(0, 3) + '••••••' : null);

/** Enmascara un correo en datos públicos: "eli***@gmail.com" */
function enmascararCorreo(correo) {
  const [local, dominio] = String(correo).split('@');
  if (!dominio) return '•••';
  const visible = local.slice(0, 3);
  const resto = local.length > 3 ? local.slice(3).replace(/./g, '•') : '';
  return `${visible}${resto}@${dominio}`;
}

export class User {
  /**
   * @param {object} data Datos del usuario
   * @param {string|null} data.apellidoPaterno Apellido paterno (dato KYC)
   * @param {string|null} data.apellidoMaterno Apellido materno (dato KYC)
   * @param {string|null} data.nombres Nombres de pila (dato KYC)
   * @param {string|null} data.direccion Dirección principal (dato KYC)
   * @param {string|null} data.id Identificador (null si aún no se persiste)
   * @param {string} data.name Nombre completo
   * @param {string} data.email Correo electrónico (único en el sistema)
   * @param {string} data.passwordHash Hash bcrypt de la contraseña
   * @param {string} data.role Rol (ver ROLES)
   * @param {string} data.state Estado (ver USER_STATES)
   * @param {string} data.dni Documento de identidad (obligatorio desde v2)
   * @param {string} data.phone Teléfono móvil peruano (obligatorio desde v2)
   * @param {boolean} data.emailVerified true si el correo fue verificado con OTP
   * @param {string|null} data.totpSecret Secreto base32 del 2FA (null = no activado)
   * @param {boolean} data.totpEnabled true si el 2FA está activado
   * @param {number} data.loginAttempts Intentos fallidos consecutivos de login
   * @param {string|null} data.blockedUntil Fecha ISO hasta la que el login está bloqueado
   * @param {string} data.createdAt Fecha de creación ISO
   */
  constructor({
    id = null, name, email, passwordHash, role = ROLES.CLIENTE, state = USER_STATES.ACTIVO,
    dni = null, phone = null, emailVerified = false, totpSecret = null, totpEnabled = false,
    loginAttempts = 0, blockedUntil = null, createdAt = null,
    apellidoPaterno = null, apellidoMaterno = null, nombres = null, direccion = null,
    backupEmail = '',
  } = {}) {
    this.id = id;
    this.name = name;
    this.email = email;
    this.backupEmail = backupEmail ?? '';
    this.passwordHash = passwordHash;
    this.role = role;
    this.state = state;
    this.dni = dni;
    this.phone = phone;
    this.emailVerified = emailVerified;
    this.totpSecret = totpSecret;
    this.totpEnabled = totpEnabled;
    this.loginAttempts = loginAttempts;
    this.blockedUntil = blockedUntil;
    this.apellidoPaterno = apellidoPaterno;
    this.apellidoMaterno = apellidoMaterno;
    this.nombres = nombres;
    this.direccion = direccion;
    this.createdAt = createdAt ?? new Date().toISOString();
    this.validate();
  }

  /** Nombre completo armado (apellidos + nombres), como en los comprobantes */
  get fullName() {
    return [this.nombres, this.apellidoPaterno, this.apellidoMaterno]
      .filter(Boolean).join(' ').trim() || this.name;
  }

  /** Valida las reglas mínimas del usuario (se invoca en construcción) */
  validate() {
    if (!this.fullName || this.fullName.length < 2) {
      throw new Error('El nombre debe tener al menos 2 caracteres');
    }
    if (!this.email || !this.email.includes('@')) {
      throw new Error('Correo electrónico inválido');
    }
    if (!this.passwordHash) {
      throw new Error('La contraseña es obligatoria');
    }
    if (!Object.values(ROLES).includes(this.role)) {
      throw new Error(`Rol inválido: ${this.role}`);
    }
    if (this.dni && !/^\d{8}[0-9K]$/.test(String(this.dni).toUpperCase())) {
      throw new Error('DNI inválido: debe tener 8 dígitos y su verificador');
    }
    if (this.phone && !PHONE_REGEX.test(String(this.phone))) {
      throw new Error('Teléfono inválido: debe tener 9 dígitos y empezar con 9');
    }
  }

  /** Indica si el usuario es administrador */
  get isAdmin() {
    return this.role === ROLES.ADMIN;
  }

  /** Indica si el usuario es trabajador del banco */
  get isTrabajador() {
    return this.role === ROLES.TRABAJADOR;
  }

  /** Indica si el usuario es cliente */
  get isCliente() {
    return this.role === ROLES.CLIENTE;
  }

  /** Indica si la cuenta está activa */
  get isActivo() {
    return this.state === USER_STATES.ACTIVO;
  }

  /** Indica si el correo ya fue verificado */
  get isEmailVerified() {
    return Boolean(this.emailVerified);
  }

  /** Indica si el login está temporalmente bloqueado por fuerza bruta */
  get isLoginBlocked() {
    if (!this.blockedUntil) return false;
    return new Date(this.blockedUntil).getTime() > Date.now();
  }

  /** Minutos restantes del bloqueo temporal (para el mensaje al usuario) */
  get loginBlockMinutesLeft() {
    if (!this.isLoginBlocked) return 0;
    return Math.ceil((new Date(this.blockedUntil).getTime() - Date.now()) / 60000);
  }

  /** Bloquea la cuenta del usuario (acción de administrador) */
  bloquear() {
    this.state = USER_STATES.BLOQUEADO;
  }

  /** Desbloquea la cuenta del usuario (acción de administrador) */
  desbloquear() {
    this.state = USER_STATES.ACTIVO;
  }

  /** Marca el correo como verificado */
  marcarEmailVerificado() {
    this.emailVerified = true;
  }

  /** Registra un intento de login fallido; bloquea si se supera el límite */
  registrarIntentoFallido(maxIntentos, minutosBloqueo) {
    this.loginAttempts += 1;
    if (this.loginAttempts >= maxIntentos) {
      this.loginAttempts = 0;
      this.blockedUntil = new Date(Date.now() + minutosBloqueo * 60 * 1000).toISOString();
      return true; // quedó bloqueado
    }
    return false;
  }

  /** Reinicia el contador de intentos tras un login exitoso */
  reiniciarIntentosFallidos() {
    this.loginAttempts = 0;
    this.blockedUntil = null;
  }

  /**
   * Representación pública del usuario (SIN datos sensibles).
   * Nunca exponer passwordHash, totpSecret ni contadores de seguridad.
   */
  toPublicJSON() {
    return {
      id: this.id,
      name: this.fullName,
      apellidoPaterno: this.apellidoPaterno,
      apellidoMaterno: this.apellidoMaterno,
      nombres: this.nombres,
      direccion: this.direccion,
      email: this.email,
      backupEmail: this.backupEmail ? enmascararCorreo(this.backupEmail) : null,
      role: this.role,
      state: this.state,
      dni: this.dni,
      phone: MASK_PHONE(this.phone),
      emailVerified: this.isEmailVerified,
      totpEnabled: this.totpEnabled,
      createdAt: this.createdAt,
    };
  }
}