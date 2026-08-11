# 🏦 OmniCash — Banco Digital

Banco digital **100% en línea** con **arquitectura limpia**, inspirado en el modelo de negocio de Nubank: sin sucursales, sin comisiones ocultas, todo por internet.

> **Moneda:** Créditos (1 crédito = 1 unidad de cuenta)

---

## ✨ Funcionalidades

### Para el cliente
- **Apertura de cuenta con verificación de identidad real**: DNI con dígito verificador (RENIEC), teléfono peruano y **código OTP enviado a su correo electrónico**. Sin verificar el correo, la cuenta no se activa.
- **Número de cuenta CCI de 20 dígitos** (3 banco + 5 agencia + 10 cuenta + 2 verificadores), el estándar interbancario peruano.
- Ver saldo, CCI y estado.
- **Depósito por Yape** (simulado): 1 sol = 1 crédito, tope de 1000 por operación y 3000 por día.
- **Retiro en cajero** de cualquier red (simulado): comisión 5% y límite diario de 1000 créditos.
- **Transferencias** instantáneas a cualquier CCI OmniCash.
- **Verificación en dos pasos (2FA)**: TOTP con Google Authenticator/Authy, con QR.
- **Gestión de sesiones**: ver dispositivos conectados, revocar sesiones y cerrar todas.
- Historial completo de movimientos.

### Para el trabajador (soporte)
- Ver todos los clientes del banco con su saldo.
- Realizar **depósitos en ventanilla** a cualquier cuenta.

### Para el administrador supremo (dueño del banco)
- Dashboard con métricas globales: usuarios, clientes, trabajadores, cuentas y total de créditos.
- **Bloquear/activar** clientes (inmoviliza su cuenta bancaria automáticamente).
- **Eliminar** clientes.
- **Contratar trabajadores**.
- Registro de **auditoría** de toda operación sensible.

---

## 🚀 Instalación y arranque

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar el correo real (obligatorio para recibir códigos)
cp .env.example .env
```

### 📧 Configurar Gmail (los códigos llegan de verdad)
1. Activa la **Verificación en 2 pasos** de tu Gmail: https://myaccount.google.com/security
2. Crea una **contraseña de aplicación**: https://myaccount.google.com/apppasswords
3. En el `.env` escribe:
   ```
   GMAIL_USER=tu-correo@gmail.com
   GMAIL_APP_PASSWORD=xxxxxxxxxxxxxxxx
   ```
4. Si no configuras SMTP, el sistema sigue funcionando en modo desarrollo: el código se imprime en la consola del servidor.

```bash
# 3. Crear el administrador supremo (solo la primera vez)
npm run seed

# 4. Iniciar el servidor
npm start
```

Abre el navegador en: **http://localhost:4000**

### Credenciales iniciales (¡cámbialas en producción!)

| Rol | Correo | Contraseña |
|---|---|---|
| Administrador supremo | `admin@omnicash.com` | `Admin12345` |

---

## 🏛️ Arquitectura del sistema

El proyecto sigue **Clean Architecture** (arquitectura limpia) en 4 capas, de adentro hacia afuera:

```
OmniCash/
├── src/
│   ├── domain/            ← 1. NÚCLEO: reglas de negocio puras
│   │   ├── entities/          (User, Account, Transaction)
│   │   └── errors/            (DomainError y derivados)
│   ├── application/       ← 2. CASOS DE USO: orquesta el dominio
│   │   └── use-cases/         (registrar, verificarEmail, iniciarSesion,
│   │                            verificar2fa, reautenticar, transferir...)
│   ├── infrastructure/    ← 3. ADAPTADORES: tecnologías externas
│   │   ├── database/          (node:sqlite, repositorios)
│   │   ├── security/          (bcrypt, TOTP RFC 6238, OTP, DNI/CCI, sesiones)
│   │   ├── email/             (nodemailer → SMTP Gmail)
│   │   └── repositories/      (SQL aislado del dominio)
│   └── interfaces/        ← 4. PRESENTACIÓN: HTTP y web
│       ├── http/              (Express: rutas, controladores, middlewares)
│       └── web/               (HTML, CSS, JS del frontend)
├── seeds/                 ← Creación del admin inicial
└── tests/                 ← Pruebas automatizadas
```

### Reglas de la arquitectura
1. **El dominio no sabe nada** de Express, SQL ni JWT: solo reglas de negocio (no sobregirar, montos positivos, estados).
2. **Los casos de uso** orquestan: validan → llaman dominio → persisten.
3. **Los repositorios** aíslan el SQL (se pueden cambiar SQLite por PostgreSQL sin tocar el dominio).
4. **Los controladores** solo traducen HTTP ↔ casos de uso.

---

## 🔐 Seguridad de nivel bancario

| Medida | Implementación |
|---|---|
| **Verificación de identidad** | DNI con **dígito verificador RENIEC** + teléfono peruano + correo con **código OTP**. La cuenta se activa solo tras verificar el correo |
| **Contraseñas** | Hash **bcrypt** + política fuerte (≥8, mayúscula, minúscula, número) |
| **Sesiones** | Token opaco aleatorio con **hash SHA-256 en BD** (revocables, expiración configurable) |
| **Anti fuerza bruta** | 5 intentos fallidos → **bloqueo temporal de 15 min** + **alerta al correo** del cliente |
| **Anti-enumeración** | Login con comparación de tiempo constante contra hash ficticio |
| **2FA (TOTP)** | El estándar de Google Authenticator (RFC 6238), activable con QR por el cliente |
| **Reautenticación** | Retiros y transferencias ≥ 100 créditos exigen contraseña o código 2FA de nuevo (token de un solo uso, 5 min) |
| **Gestión de sesiones** | Ver/revocar sesiones activas y cerrar las de otros dispositivos |
| **Códigos OTP** | Guardados solo como hash SHA-256 con salt; expiración, tope de intentos y reenvío limitado |
| **Numeración bancaria** | CCI de 20 dígitos con **dígitos de verificación mod-11** (estilo BCRP/SBS) |
| Autorización | Middleware por rol (ADMIN/TRABAJADOR/CLIENTE) |
| Bloqueo | Usuario bloqueado no puede iniciar sesión y su cuenta queda congelada |
| Auditoría | Toda operación sensible queda registrada con autor, IP y dispositivo |

### Reglas de negocio clave
- ❌ No sobregirar: el saldo nunca baja de 0.
- ❌ No transferir a tu propia cuenta.
- ❌ Límite diario de retiro en cajero: 1000 créditos (configurable en `.env`).
- ❌ Comisión de cajero: 5% (configurable en `.env`).
- ❌ Depósito máximo por operación: 100 000 créditos; por Yape: 1000/operación y 3000/día.
- ❌ Un trabajador no puede bloquear ni eliminar (solo el admin supremo).
- ❌ El admin no puede autobloquearse ni autoeliminarse.
- ❌ Un token de reautenticación y un código OTP **solo sirven una vez**.

---

## 📡 API REST

### Autenticación y seguridad
| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| POST | `/api/auth/registro` | Público | Solicita apertura de cuenta y envía OTP al correo |
| POST | `/api/auth/registro/verificar` | Público | Verifica el código y **activa la cuenta** |
| POST | `/api/auth/registro/reenviar` | Público | Reenvía el código (limitado) |
| POST | `/api/auth/login` | Público | Paso 1: contraseña (+ token temporal si hay 2FA) |
| POST | `/api/auth/login/2fa` | Público | Paso 2: código TOTP → sesión real |
| GET | `/api/auth/yo` | Cualquier rol | Datos del usuario autenticado |
| POST | `/api/auth/reauth` | Sesión | Confirma identidad para operaciones sensibles |
| POST | `/api/auth/2fa/iniciar` | Sesión | Genera secreto + QR del 2FA |
| POST | `/api/auth/2fa/confirmar` | Sesión | Valida código y activa el 2FA |
| POST | `/api/auth/2fa/desactivar` | Sesión | Desactiva el 2FA con contraseña |
| GET | `/api/auth/sesiones` | Sesión | Lista sesiones activas |
| DELETE | `/api/auth/sesiones/:id` | Sesión | Revoca una sesión |
| DELETE | `/api/auth/sesiones` | Sesión | Cierra sesión en todos los demás dispositivos |

### Banca
| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| GET | `/api/cuenta` | Cliente | Saldo + CCI + movimientos |
| POST | `/api/cuenta/retiro` | Cliente | Retiro en cajero (comisión + límite; reauth si ≥ 100) |
| POST | `/api/cuenta/transferencia` | Cliente | Transferir por CCI (reauth si ≥ 100) |
| POST | `/api/cuenta/deposito-yape` | Cliente | Carga por Yape (simulado) |
| POST | `/api/cuenta/deposito` | Admin/Trabajador | Depósito en ventanilla |
| GET | `/api/admin/dashboard` | Admin | Métricas globales |
| POST | `/api/admin/usuarios/:id/estado` | Admin | Bloquear/activar cliente |
| DELETE | `/api/admin/usuarios/:id` | Admin | Eliminar cliente |
| POST | `/api/admin/trabajadores` | Admin | Crear trabajador |
| GET | `/api/admin/clientes` | Admin/Trabajador | Lista clientes para soporte |

> Las operaciones sensibles (`retiro`, `transferencia`) con monto ≥ `SENSITIVE_OPERATION_MIN` (100) exigen el header `X-Reauth-Token` obtenido en `/api/auth/reauth`.

---

## 🧪 Pruebas

```bash
npm test
```

18 pruebas: dominio (cuentas, sobregiro, estados), DNI peruano, CCI con verificadores, TOTP contra los vectores oficiales del RFC 6238, OTP y control de fuerza bruta.

---

## 🗺️ Próximas fases (roadmap)

- **Fase 2:** Red de cajeros reales (BCP, BBVA, Banco de la Nación...) con comisiones por red y límites por banco.
- **Fase 3:** Tarjetas virtuales (BIN + PAN + Luhn) con PIN cifrado.
- **Fase 4:** Préstamos y scoring de crédito.
- **Fase 5:** Inversiones (depósitos con rendimiento), como el modelo de float de Nubank.
- **Fase 6:** IA para atención al cliente y detección de fraude.

---

## 🧾 Basado en el modelo Nubank

- Sin sucursales → costo de servicio mínimo.
- Todo digital: apertura de cuenta en minutos.
- Producto principal de entrada (cuenta + transferencias) → ampliación a créditos, inversiones y más.
- Transparencia total en tarifas y reglas.