/**
 * OmniCash — Frontend
 * Lógica de la página de autenticación (login / registro / OTP / 2FA).
 * La sesión persiste con "Recuérdame" (localStorage) o vive solo en la
 * pestaña sin él (sessionStorage).
 */

// ---------- Utilidades ----------
const $ = (id) => document.getElementById(id);
const API = '/api';

/** Muestra un mensaje en la caja de avisos (vacío = la oculta) */
function mostrarMsg(texto, tipo = 'error') {
  const msg = $('authMsg');
  msg.textContent = texto;
  msg.className = texto ? `auth-msg ${tipo}` : 'auth-msg hidden';
}

/** Muestra un formulario y oculta el resto */
function mostrarFormulario(visible, ocultos) {
  visible.classList.remove('hidden');
  ocultos.forEach(f => { if (f !== visible) f.classList.add('hidden'); });
}

// ---------- Cambio entre login y registro (enlace inferior) ----------
const TODOS_FORMULARIOS = ['loginForm', 'registerForm', 'otpForm', 'faForm', 'recoverForm', 'recoverCodeForm', 'recoverConfirmForm'];

// Guarda el código ya verificado para usarlo en el paso final (sin reescribirlo)
let codigoRecuperacion = '';

/** Sincroniza el enlace inferior con el formulario visible */
function sincronizarTabs() {
  const login = !$('loginForm').classList.contains('hidden');
  const tabLogin = $('tabLogin'), tabRegister = $('tabRegister');
  if (tabLogin) tabLogin.classList.toggle('active', login);
  if (tabRegister) tabRegister.classList.toggle('active', !login);
  $('switchText').textContent = login ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?';
  $('switchLink').textContent = login ? 'Regístrate aquí' : 'Inicia sesión';
}

/** Muestra login o registro (y sincroniza el enlace inferior) */
function irAPestana(login) {
  mostrarFormulario($(login ? 'loginForm' : 'registerForm'), TODOS_FORMULARIOS.map($));
  sincronizarTabs();
  mostrarMsg('', '');
}

const tabLoginEl = $('tabLogin'), tabRegisterEl = $('tabRegister');
if (tabLoginEl) tabLoginEl.addEventListener('click', () => irAPestana(true));
if (tabRegisterEl) tabRegisterEl.addEventListener('click', () => irAPestana(false));

$('switchLink').addEventListener('click', (e) => {
  e.preventDefault();
  irAPestana($('loginForm').classList.contains('hidden'));
});

// ---------- Recuperación de contraseña ----------
$('lnkRecuperar').addEventListener('click', (e) => {
  e.preventDefault();
  codigoRecuperacion = '';
  mostrarFormulario($('recoverForm'),
    [$('loginForm'), $('registerForm'), $('otpForm'), $('faForm'), $('recoverCodeForm'), $('recoverConfirmForm')]);
});

$('btnRecoverCancel').addEventListener('click', () => {
  codigoRecuperacion = '';
  mostrarFormulario($('loginForm'), TODOS_FORMULARIOS.map($));
  sincronizarTabs();
});

// Paso 1: solicitar el código al correo principal
$('recoverForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  mostrarMsg('Verificando sus datos...', 'ok');
  try {
    const data = await peticion('/auth/recuperar', {
      dni: $('recDni').value.trim(),
      email: $('recEmail').value.trim(),
    });
    codigoRecuperacion = '';
    $('recCodigoVerif').value = '';
    $('recPassword').value = '';
    $('recPassword2').value = '';
    mostrarFormulario($('recoverCodeForm'),
      [$('loginForm'), $('registerForm'), $('otpForm'), $('faForm'), $('recoverForm'), $('recoverConfirmForm')]);
    mostrarMsg(`Si los datos coinciden, enviamos el código a ${data.correoEnmascarado}`, 'ok');
  } catch (err) {
    mostrarMsg(err.message);
  }
});

// Paso 1.5: verificar el código recibido (sin cambiar la clave aún)
$('recoverCodeForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  mostrarMsg('Verificando el código...', 'ok');
  try {
    const data = await peticion('/auth/recuperar/verificar-codigo', {
      dni: $('recDni').value.trim(),
      email: $('recEmail').value.trim(),
      codigo: $('recCodigoVerif').value.trim(),
    });
    codigoRecuperacion = $('recCodigoVerif').value.trim();
    $('recCodigoVerif').value = '';
    mostrarFormulario($('recoverConfirmForm'),
      [$('loginForm'), $('registerForm'), $('otpForm'), $('faForm'), $('recoverForm'), $('recoverCodeForm')]);
    mostrarMsg(data.mensaje || 'Código verificado. Crea tu nueva contraseña.', 'ok');
  } catch (err) {
    mostrarMsg(err.message);
  }
});

$('btnRecoverCodeCancel').addEventListener('click', () => {
  codigoRecuperacion = '';
  mostrarFormulario($('loginForm'), TODOS_FORMULARIOS.map($));
  sincronizarTabs();
});

// Paso 2: nueva contraseña (el código ya fue verificado)
$('recoverConfirmForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const clave = $('recPassword').value;
  const clave2 = $('recPassword2').value;
  if (clave !== clave2) {
    mostrarMsg('Las contraseñas no coinciden. Revísalas', 'error');
    return;
  }
  if (!codigoRecuperacion) {
    mostrarMsg('Vuelve a verificar tu código antes de crear la contraseña', 'error');
    return;
  }
  mostrarMsg('Restableciendo su contraseña...', 'ok');
  try {
    await peticion('/auth/recuperar/confirmar', {
      dni: $('recDni').value.trim(),
      email: $('recEmail').value.trim(),
      codigo: codigoRecuperacion,
      nuevaPassword: clave,
    });
    codigoRecuperacion = '';
    mostrarMsg('Contraseña restablecida. Inicia sesión con la nueva.', 'ok');
    $('loginEmail').value = '';
    $('loginPassword').value = '';
    mostrarFormulario($('loginForm'), TODOS_FORMULARIOS.map($));
    sincronizarTabs();
  } catch (err) {
    mostrarMsg(err.message);
  }
});

$('btnRecoverConfirmCancel').addEventListener('click', () => {
  codigoRecuperacion = '';
  mostrarFormulario($('loginForm'), TODOS_FORMULARIOS.map($));
  sincronizarTabs();
});

// ---------- Enviar peticiones con fetch ----------
async function peticion(url, body) {
  const res = await fetch(API + url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error del servidor');
  return data;
}

// ---------- Sesión ----------
/**
 * Guarda la sesión del usuario.
 * - Con "Recuérdame" marcado (por defecto): el token va a localStorage y
 *   la sesión sobrevive al cerrar el navegador (se cierra solo al salir).
 * - Sin marcar: sessionStorage (se pierde al cerrar la pestaña).
 */
function guardarSesion(data) {
  const persistente = $('rememberMe').checked;
  const almacen = persistente ? localStorage : sessionStorage;
  almacen.setItem('omnicash_token', data.token);
  almacen.setItem('omnicash_usuario', JSON.stringify(data.usuario));
  ["omnicash_token", "omnicash_usuario"].forEach(k => {
    if (persistente) sessionStorage.removeItem(k);
    else localStorage.removeItem(k);
  });
  window.location.href = '/dashboard.html';
}

// ---------- Autocompletado de identidad por DNI (RENIEC) ----------
let dniTimeout = null;
$('regDni').addEventListener('input', () => {
  const dni = $('regDni').value.replace(/\D/g, '').slice(0, 8);
  $('regDni').value = dni;
  const status = $('regDniStatus');
  if (dni.length !== 8) {
    status.textContent = 'Ingrese su DNI para continuar con la validación de identidad';
    status.className = 'auth-hint-inline';
    return;
  }
  clearTimeout(dniTimeout);
  dniTimeout = setTimeout(async () => {
    status.textContent = 'Verificando su identidad...';
    status.className = 'auth-hint-inline';
    try {
      const res = await fetch(API + '/auth/dni/' + dni);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Error del servidor');
      // Solo rellena los campos: el cliente puede corregirlos si es necesario.
      // La coincidencia final con RENIEC la valida el servidor al registrar.
      $('regPaterno').value = data.paterno || '';
      $('regMaterno').value = data.materno || '';
      $('regNombres').value = data.nombres || '';
      status.textContent = 'Identidad verificada. Puede corregir los datos si es necesario.';
      status.className = 'auth-hint-inline ok';
    } catch (err) {
      status.textContent = 'No fue posible verificar su identidad automáticamente. Complete sus datos manualmente.';
      status.className = 'auth-hint-inline warn';
    }
  }, 500);
});

// ---------- Login paso 1: contraseña ----------
$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  mostrarMsg('Verificando identidad...', 'ok');
  try {
    const data = await peticion('/auth/login', {
      email: $('loginEmail').value.trim(),
      password: $('loginPassword').value,
    });
    if (data.requiere2fa) {
      // Guarda el token temporal para el segundo paso
      sessionStorage.setItem('omnicash_temporal', data.sesionTemporal);
      mostrarFormulario($('faForm'), [$('loginForm'), $('registerForm'), $('otpForm'), $('recoverForm'), $('recoverConfirmForm')]);
      mostrarMsg('', '');
      $('faCodigo').focus();
      return;
    }
    guardarSesion(data);
  } catch (err) {
    mostrarMsg(err.message);
  }
});

// ---------- Login paso 2: código TOTP ----------
$('faForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  mostrarMsg('Verificando código...', 'ok');
  try {
    const data = await peticion('/auth/login/2fa', {
      sesionTemporal: sessionStorage.getItem('omnicash_temporal'),
      codigo: $('faCodigo').value.trim(),
    });
    sessionStorage.removeItem('omnicash_temporal');
    guardarSesion(data);
  } catch (err) {
    mostrarMsg(err.message);
  }
});

$('faCancelar').addEventListener('click', () => {
  sessionStorage.removeItem('omnicash_temporal');
  mostrarFormulario($('loginForm'), TODOS_FORMULARIOS.map($));
  sincronizarTabs();
  mostrarMsg('', '');
});

// ---------- Ojito: mostrar/ocultar contraseñas ----------
const ICONO_OJO = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
const ICONO_OJO_TACHADO = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><path d="M1 1l22 22"/></svg>';
document.querySelectorAll('.eye-btn').forEach(boton => {
  boton.addEventListener('click', () => {
    const campo = $(boton.dataset.target);
    const visible = campo.type === 'text';
    campo.type = visible ? 'password' : 'text';
    boton.innerHTML = visible ? ICONO_OJO : ICONO_OJO_TACHADO;
  });
});

// ---------- Registro: primer paso (datos) ----------
$('registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const clave = $('regPassword').value;
  const clave2 = $('regPassword2').value;

  // Las contraseñas deben coincidir (confirmación a la vista del usuario)
  if (clave !== clave2) {
    mostrarMsg('Las contraseñas no coinciden. Revísalas', 'error');
    return;
  }

  mostrarMsg('Comprobando su identidad...', 'ok');
  try {
    const data = await peticion('/auth/registro', {
      paterno: $('regPaterno').value.trim(),
      materno: $('regMaterno').value.trim(),
      nombres: $('regNombres').value.trim(),
      dni: $('regDni').value.trim(),
      direccion: $('regDireccion').value.trim(),
      phone: $('regPhone').value.trim(),
      email: $('regEmail').value.trim(),
      backupEmail: $('regBackupEmail').value.trim(),
      password: clave,
    });
    // Paso 2: pedir el código que llegó al correo
    mostrarFormulario($('otpForm'), [$('loginForm'), $('registerForm'), $('faForm'), $('recoverForm'), $('recoverConfirmForm')]);
    $('otpCorreo').textContent = data.correo;
    $('otpCodigo').value = '';
    $('otpCodigo').focus();
    mostrarMsg('', '');
  } catch (err) {
    mostrarMsg(err.message);
  }
});

// ---------- Registro: verificación del correo ----------
$('otpForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  mostrarMsg('Verificando código...', 'ok');
  try {
    await peticion('/auth/registro/verificar', {
      email: $('otpCorreo').textContent,
      codigo: $('otpCodigo').value.trim(),
    });
    mostrarMsg('Cuenta activada. Ya puedes iniciar sesión.', 'ok');
    // Vuelve al login con el correo precargado
    $('loginEmail').value = $('otpCorreo').textContent;
    $('loginPassword').value = '';
    mostrarFormulario($('loginForm'), TODOS_FORMULARIOS.map($));
    sincronizarTabs();
  } catch (err) {
    mostrarMsg(err.message);
  }
});

// ---------- Reenvío del código ----------
$('otpReenviar').addEventListener('click', async () => {
  $('otpReenviar').disabled = true;
  mostrarMsg('Enviando un código nuevo...', 'ok');
  try {
    await peticion('/auth/registro/reenviar', { email: $('otpCorreo').textContent });
    mostrarMsg('Código reenviado a su correo', 'ok');
  } catch (err) {
    mostrarMsg(err.message);
  } finally {
    setTimeout(() => { $('otpReenviar').disabled = false; }, 3000);
  }
});

// ---------- Acceso directo al registro desde la portada (?tab=registro) ----------
if (new URLSearchParams(window.location.search).get('tab') === 'registro') {
  irAPestana(false);
}