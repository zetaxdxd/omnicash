/**
 * OmniCash — Frontend
 * Lógica del dashboard: según el rol del usuario autenticado
 * muestra la vista de cliente, trabajador o administrador supremo.
 * Incluye seguridad de cuenta (2FA, sesiones) y reautenticación
 * para operaciones de monto alto.
 */

const $ = (id) => document.getElementById(id);
const API = '/api';

// ---------- Sesión ----------
/** El token puede estar en localStorage (sesión recuérdame) o sessionStorage */
const token = localStorage.getItem('omnicash_token') || sessionStorage.getItem('omnicash_token');
const usuario = JSON.parse(localStorage.getItem('omnicash_usuario') || sessionStorage.getItem('omnicash_usuario') || 'null');

// Sin sesión: volver al login
if (!token || !usuario) {
  window.location.href = '/';
}

/** Cabeceras con token de autenticación */
function headers(reauthToken) {
  const h = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
  if (reauthToken) h['X-Reauth-Token'] = reauthToken;
  return h;
}

/** Petición autenticada con manejo de errores centralizado */
async function peticion(url, method = 'GET', body = null, reauthToken = null) {
  const res = await fetch(API + url, {
    method,
    headers: headers(reauthToken),
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) { cerrarSesion(); return; }
    throw new Error(data.error || 'Error del servidor');
  }
  return data;
}

/** Cierra la sesión (botón "Salir") y limpia todo el almacenamiento */
function cerrarSesion() {
  localStorage.removeItem('omnicash_token');
  localStorage.removeItem('omnicash_usuario');
  sessionStorage.removeItem('omnicash_token');
  sessionStorage.removeItem('omnicash_usuario');
  window.location.href = '/';
}

// ---------- Menú de configuración ----------

/** Modo del modal de datos: true = solo número, false = datos completos */
let modoDatosActual = false;

/** Configura el menú desplegable de la barra superior */
function configurarMenuConfiguracion() {
  $('btnConfig').addEventListener('click', (e) => {
    e.stopPropagation();
    $('confMenu').classList.toggle('hidden');
  });

  // Cierra el menú al hacer clic fuera
  document.addEventListener('click', (e) => {
    if (!$('confMenu').classList.contains('hidden') && !$('navUserWrap').contains(e.target)) {
      $('confMenu').classList.add('hidden');
    }
  });

  // Acciones del menú
  document.querySelectorAll('.conf-item').forEach((item) => {
    item.addEventListener('click', async () => {
      $('confMenu').classList.add('hidden');
      const accion = item.dataset.accion;
      if (accion === 'salir') return cerrarSesion();
      if (accion === 'datos') return abrirModalDatos(false);
      if (accion === 'numero') return abrirModalDatos(true);
      if (accion === 'password') return abrirModalContrasena();
      if (accion === 'seguridad') return irASeguridad();
      if (accion === 'cerrarSesiones') return cerrarOtrasSesiones();
    });
  });

  // modal datos
  $('datosCancelar').addEventListener('click', () => $('datosModal').classList.add('hidden'));
  $('datosEnviar').addEventListener('click', enviarCodigoDatos);
  $('datosAplicar').addEventListener('click', aplicarCambioDatos);

  // modal contraseña
  $('passCancelar').addEventListener('click', () => $('passModal').classList.add('hidden'));
  $('passGuardar').addEventListener('click', guardarContrasena);
}

/** Desplaza hacia la tarjeta de seguridad de la cuenta */
function irASeguridad() {
  const card = $('seguridadCard');
  if (card) {
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else {
    alert('La sección de seguridad está disponible para clientes.');
  }
}

/** Cierra la sesión en todos los demás dispositivos */
async function cerrarOtrasSesiones() {
  if (!confirm('¿Cerrar sesión en los demás dispositivos?')) return;
  try {
    await peticion('/auth/sesiones', 'DELETE', {});
    alert('Se cerró la sesión en los demás dispositivos');
    if (typeof cargarSeguridad === 'function') cargarSeguridad();
  } catch (err) {
    alert(`${err.message}`);
  }
}

/** Abre el modal de datos personales (o solo número) */
function abrirModalDatos(soloNumero) {
  modoDatosActual = soloNumero;
  const campos = document.querySelectorAll('#datosCampos label');
  const esNumero = soloNumero ? 1 : 0;
  campos.forEach((l, i) => l.classList.toggle('hidden', i < 5 && esNumero === 1));

  if (soloNumero) {
    $('datosTitulo').textContent = 'Cambiar mi número';
    $('datosInfo').textContent = 'Ingrese su nuevo celular. Enviaremos un código a su correo para confirmar el cambio.';
  } else {
    $('datosTitulo').textContent = 'Mis datos personales';
    $('datosInfo').textContent = 'Actualice sus datos y confirme con el código que enviaremos a su correo.';
    $('datosPaterno').value = usuario.apellidoPaterno ?? '';
    $('datosMaterno').value = usuario.apellidoMaterno ?? '';
    $('datosNombres').value = usuario.nombres ?? '';
    $('datosDni').value = usuario.dni ?? '';
    $('datosDireccion').value = usuario.direccion ?? '';
  }
  $('datosDni').value = usuario.dni ?? '';
  $('datosPhone').value = '';
  $('datosCodigo').value = '';
  $('datosMsg').textContent = '';
  $('datosCodigoZona').classList.add('hidden');
  $('datosEnviar').classList.remove('hidden');
  $('datosAplicar').classList.add('hidden');
  $('datosModal').classList.remove('hidden');
}

/** Paso 1: pide el código de autorización al correo principal */
async function enviarCodigoDatos() {
  const dni = $('datosDni').value.trim();
  $('datosMsg').textContent = 'Enviando código a su correo...';
  try {
    await peticion('/auth/identidad/solicitar', 'POST', { dni });
    $('datosCodigoZona').classList.remove('hidden');
    $('datosEnviar').classList.add('hidden');
    $('datosAplicar').classList.remove('hidden');
    $('datosMsg').textContent = 'Revise su correo principal e ingrese el código de 6 dígitos.';
    $('datosMsg').style.color = 'var(--verde)';
    $('datosCodigo').focus();
  } catch (err) {
    $('datosMsg').textContent = `${err.message}`;
    $('datosMsg').style.color = 'var(--rojo)';
  }
}

/** Paso 2: aplica los cambios con el código recibido */
async function aplicarCambioDatos() {
  const codigo = $('datosCodigo').value.trim();
  const cambios = {};

  if (modoDatosActual) {
    cambios.phone = $('datosPhone').value.trim();
  } else {
    cambios.apellidoPaterno = $('datosPaterno').value.trim();
    cambios.apellidoMaterno = $('datosMaterno').value.trim();
    cambios.nombres = $('datosNombres').value.trim();
    cambios.direccion = $('datosDireccion').value.trim();
    const phoneNuevo = $('datosPhone').value.trim();
    if (phoneNuevo) cambios.phone = phoneNuevo;
    cambios.dni = $('datosDni').value.trim();
  }

  $('datosMsg').textContent = 'Guardando sus cambios...';
  try {
    await peticion('/auth/identidad/aplicar', 'POST', { codigo, cambios });
    $('datosMsg').textContent = 'Sus datos fueron actualizados';
    $('datosMsg').style.color = 'var(--verde)';
    refrescarIdentidadLocal();
    setTimeout(() => $('datosModal').classList.add('hidden'), 900);
  } catch (err) {
    $('datosMsg').textContent = `${err.message}`;
    $('datosMsg').style.color = 'var(--rojo)';
  }
}

/** Actualiza el usuario guardado en el navegador tras un cambio de datos */
async function refrescarIdentidadLocal() {
  try {
    const data = await peticion('/auth/yo');
    const fresco = data.usuario;
    localStorage.setItem('omnicash_usuario', JSON.stringify(fresco));
    sessionStorage.setItem('omnicash_usuario', JSON.stringify(fresco));
    Object.assign(usuario, fresco);
    $('userName').textContent = fresco.name;
    $('confName').textContent = fresco.name;
    $('navAvatar').textContent = (fresco.name || '?').trim().charAt(0).toUpperCase();
  } catch { /* si falla, se actualiza en la próxima visita */ }
}

/** Abre el modal para cambiar la contraseña */
function abrirModalContrasena() {
  $('passActual').value = '';
  $('passNueva').value = '';
  $('passNueva2').value = '';
  $('passMsg').textContent = '';
  $('passModal').classList.remove('hidden');
  $('passActual').focus();
}

/** Aplica el cambio de contraseña */
async function guardarContrasena() {
  const actual = $('passActual').value;
  const nueva = $('passNueva').value;
  const repetida = $('passNueva2').value;

  if (nueva !== repetida) {
    $('passMsg').textContent = 'Las contraseñas nuevas no coinciden';
    $('passMsg').style.color = 'var(--rojo)';
    return;
  }

  $('passMsg').textContent = 'Cambiando su contraseña...';
  try {
    await peticion('/auth/cambiar-contrasena', 'POST', { passwordActual: actual, nuevaPassword: nueva });
    $('passMsg').textContent = 'Contraseña cambiada. Las demás sesiones se cerraron.';
    $('passMsg').style.color = 'var(--verde)';
    setTimeout(() => $('passModal').classList.add('hidden'), 1200);
  } catch (err) {
    $('passMsg').textContent = `${err.message}`;
    $('passMsg').style.color = 'var(--rojo)';
  }
}

// ---------- Centro de soporte (equipo + WhatsApp) ----------

/** Abre el modal y carga el equipo de soporte desde el servidor */
async function abrirSoporte() {
  $('soporteMsg').textContent = '';
  $('soporteLista').innerHTML = '<p class="card-sub">Cargando equipo de soporte...</p>';
  $('soporteModal').classList.remove('hidden');
  try {
    const data = await peticion('/auth/soporte');
    const items = data.soportes;
    if (!items.length) {
      $('soporteLista').innerHTML = '<p class="card-sub">Por el momento no hay ejecutivos de soporte disponibles.</p>';
      return;
    }
    $('soporteLista').innerHTML = items.map((s) => {
      const wa = s.whatsapp ? `https://wa.me/${s.whatsapp}?text=${encodeURIComponent('Hola, soy cliente de OmniCash y necesito ayuda.')}` : null;
      const nombre = s.name || 'Ejecutivo de soporte';
      const sub = wa ? `<span class="card-sub">WhatsApp: +${s.whatsapp}</span>` : `<span class="card-sub">${s.email}</span>`;
      return `
        <button class="soporte-item" data-wa="${wa || ''}">
          <span class="soporte-avatar">${nombre.trim().charAt(0).toUpperCase()}</span>
          <span class="soporte-info">
            <strong>${nombre}</strong>
            ${sub}
          </span>
          ${wa ? '<span class="soporte-wa"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91C21.95 6.45 17.5 2 12.04 2zm5.83 14.26c-.24.68-1.4 1.3-1.93 1.35-.52.05-1.18.24-3.98-.83-3.36-1.3-5.47-4.66-5.63-4.88-.16-.21-1.35-1.79-1.35-3.42 0-1.63.86-2.43 1.16-2.77.3-.33.66-.42.88-.42.22 0 .44 0 .63.01.2.01.47-.08.73.56.27.64.92 2.23 1 2.39.08.16.14.35.03.56-.11.21-.17.34-.33.53-.16.19-.34.42-.49.57-.16.16-.33.34-.15.67.18.33.81 1.34 1.74 2.17 1.2 1.07 2.2 1.4 2.51 1.56.31.16.5.13.68-.08.18-.21.78-.91.99-1.22.21-.31.42-.26.7-.16.29.11 1.84.87 2.15 1.03.32.16.53.24.6.37.08.14.08.8-.16 1.47z"/></svg></span>' : ''}
        </button>
      `;
    }).join('');
  } catch (err) {
    $('soporteMsg').textContent = err.message;
  }
}

$('btnSoporte').addEventListener('click', abrirSoporte);
$('soporteCerrar').addEventListener('click', () => $('soporteModal').classList.add('hidden'));

/** Al hacer clic en un ejecutivo: abre WhatsApp con el mensaje precargado */
document.getElementById('soporteLista').addEventListener('click', (e) => {
  const item = e.target.closest('.soporte-item');
  if (!item) return;
  const wa = item.dataset.wa;
  if (!wa) { $('soporteMsg').textContent = 'Este ejecutivo aún no tiene WhatsApp configurado.'; return; }
  window.open(wa, '_blank');
});

// ---------- Formato ----------
function formatoCreditos(n) {
  return Number(n).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatoFecha(iso) {
  const d = new Date(iso);
  return d.toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// ---------- Aprobación de operaciones (contraseña + código del correo) ----------
/** Devuelve una promesa que resuelve con el token REAUTH (o null si cancela) */
function pedirReautenticacion(contexto) {
  return new Promise((resolve) => {
    $('reauthModal').classList.remove('hidden');
    $('reauthInfo').textContent = `${contexto} Confirme su identidad para autorizar la operación.`;
    $('reauthMsg').textContent = '';
    $('reauthValue').value = '';
    $('reauthCodigo').value = '';
    $('reauthCodigoZona').classList.add('hidden');
    $('reauthAceptar').textContent = 'Continuar';
    $('reauthValue').focus();

    const terminar = (rt) => {
      $('reauthModal').classList.add('hidden');
      $('reauthAceptar').onclick = null;
      $('reauthCancelar').onclick = null;
      resolve(rt);
    };

    $('reauthCancelar').onclick = () => terminar(null);

    $('reauthAceptar').onclick = async () => {
      const password = $('reauthValue').value;
      const codigo = $('reauthCodigo').value.trim();

      if (!password) {
        $('reauthMsg').textContent = 'Ingrese su contraseña';
        return;
      }

      // Paso 1: enviar el código de aprobación al correo (solo una vez)
      if ($('reauthCodigoZona').classList.contains('hidden')) {
        $('reauthMsg').textContent = 'Enviando código de aprobación a su correo...';
        try {
          const data = await peticion('/auth/reauth/iniciar', 'POST', { password });
          $('reauthCodigoZona').classList.remove('hidden');
          $('reauthCorreoInfo').textContent = `Revise su correo (${data.correo}) e ingrese el código de 6 dígitos.`;
          $('reauthAceptar').textContent = 'Confirmar operación';
          $('reauthMsg').textContent = '';
          $('reauthCodigo').focus();
        } catch (err) {
          $('reauthMsg').textContent = `${err.message}`;
        }
        return;
      }

      // Paso 2: confirmar con contraseña + código del correo
      $('reauthMsg').textContent = 'Verificando...';
      try {
        const data = await peticion('/auth/reauth', 'POST', { password, codigo });
        terminar(data.reauthToken);
      } catch (err) {
        $('reauthMsg').textContent = `${err.message}`;
      }
    };
  });
}

/** Ejecuta una operación pidiendo aprobación SIEMPRE (toda operación exige confirmación) */
async function conReauth(contexto, ejecutar) {
  const rt = await pedirReautenticacion(contexto);
  if (!rt) return;
  await ejecutar(rt);
}

// ---------- Inicialización según rol ----------
$('userName').textContent = usuario.name;
$('navAvatar').textContent = (usuario.name || '?').trim().charAt(0).toUpperCase();
$('confName').textContent = usuario.name;
$('confEmail').textContent = usuario.email ?? '';
$('confRole').textContent = usuario.role.toLowerCase();
configurarMenuConfiguracion();

if (usuario.role === 'CLIENTE') {
  $('clienteView').classList.remove('hidden');
  cargarMiCuenta();
  configurarOperacionesCliente();
  cargarSeguridad();
  configurarSeguridad();
} else if (usuario.role === 'TRABAJADOR') {
  $('trabajadorView').classList.remove('hidden');
  cargarClientes();
  configurarDeposito();
} else if (usuario.role === 'ADMIN') {
  $('adminView').classList.remove('hidden');
  cargarDashboardAdmin();
  configurarAdmin();
}

// ============================================================
// VISTA CLIENTE
// ============================================================

/** Carga saldo, CCI y movimientos */
async function cargarMiCuenta() {
  try {
    const data = await peticion('/cuenta');
    $('saldo').textContent = formatoCreditos(data.cuenta.balance);
    $('numeroCuenta').textContent = `CCI: ${data.cuenta.cci}`;
    $('cuentaEstado').textContent = `Estado: ${data.cuenta.state}`;
    $('movimientosBody').innerHTML = data.transacciones.map(t => `
      <tr>
        <td>${formatoFecha(t.createdAt)}</td>
        <td>${t.type.replace(/_/g, ' ')}</td>
        <td>${t.description}</td>
        <td>${formatoCreditos(t.amount)}</td>
      </tr>
    `).join('') || '<tr><td colspan="4">Sin movimientos todavía</td></tr>';
  } catch (err) {
    $('movimientosBody').innerHTML = `<tr><td colspan="4">${err.message}</td></tr>`;
  }
}

/** Configura los formularios de retiro, transferencia y Yape */
function configurarOperacionesCliente() {
  // Retiro en cajero
  $('retiroForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const monto = Number($('retiroMonto').value);
    $('retiroMsg').textContent = 'Procesando...';
    await conReauth('Retiro en cajero.', async (rt) => {
      try {
        const data = await peticion('/cuenta/retiro', 'POST', { monto }, rt);
        $('retiroMsg').textContent = `Retiraste ${formatoCreditos(data.totalDebitado)} (comisión ${formatoCreditos(data.comision)}). Saldo: ${formatoCreditos(data.saldoRestante)}`;
        $('retiroMsg').style.color = 'var(--verde)';
        $('retiroMonto').value = '';
        cargarMiCuenta();
      } catch (err) {
        $('retiroMsg').textContent = `${err.message}`;
        $('retiroMsg').style.color = 'var(--rojo)';
      }
    });
  });

  // Transferencia
  $('transferForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const monto = Number($('transferMonto').value);
    $('transferMsg').textContent = 'Procesando...';
    await conReauth('Transferencia.', async (rt) => {
      try {
        const data = await peticion('/cuenta/transferencia', 'POST', {
          destino: $('transferDestino').value.trim(),
          monto,
        }, rt);
        $('transferMsg').textContent = `Enviaste ${formatoCreditos(data.monto)} a ${data.destinatario}. Saldo: ${formatoCreditos(data.saldoRestante)}`;
        $('transferMsg').style.color = 'var(--verde)';
        $('transferDestino').value = ''; $('transferMonto').value = '';
        cargarMiCuenta();
      } catch (err) {
        $('transferMsg').textContent = `${err.message}`;
        $('transferMsg').style.color = 'var(--rojo)';
      }
    });
  });

  // Depósito por Yape (real: queda pendiente de confirmación del banco)
  $('yapeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('yapeMsg').textContent = 'Registrando su solicitud...';
    await conReauth('Depósito por Yape.', async (rt) => {
      try {
        const data = await peticion('/cuenta/deposito-yape', 'POST', {
          celularYape: $('yapeCelular').value.trim(),
          monto: Number($('yapeMonto').value),
          operacion: $('yapeOperacion').value.trim(),
        }, rt);
        $('yapeMsg').textContent = `Solicitud #${data.referencia}: envía S/ ${formatoCreditos(data.monto)} por Yape a ${data.yapeCelular}. Espera la confirmación del banco.`;
        $('yapeMsg').style.color = 'var(--verde)';
        $('yapeForm').reset();
        cargarDepositosYape();
      } catch (err) {
        $('yapeMsg').textContent = `${err.message}`;
        $('yapeMsg').style.color = 'var(--rojo)';
      }
    });
  });
  cargarDepositosYape();
}

/** Historial de solicitudes de depósito Yape del cliente */
async function cargarDepositosYape() {
  try {
    const data = await peticion('/cuenta/depositos-yape');
    $('yapeHistorialBody').innerHTML = data.depositos.map(d => `
      <tr>
        <td>#${d.id}</td>
        <td>${formatoCreditos(d.amount)}</td>
        <td><span class="badge ${d.state}">${d.state}</span></td>
        <td>${formatoFecha(d.createdAt)}</td>
      </tr>
    `).join('') || '<tr><td colspan="4">Sin solicitudes</td></tr>';
  } catch (err) {
    $('yapeHistorialBody').innerHTML = `<tr><td colspan="4">${err.message}</td></tr>`;
  }
}

// ============================================================
// SEGURIDAD DE LA CUENTA (cliente)
// ============================================================

/** Carga el estado del 2FA y las sesiones activas */
async function cargarSeguridad() {
  try {
    const sesiones = await peticion('/auth/sesiones');
    $('sesionesBody').innerHTML = sesiones.sesiones.map(s => `
      <tr>
        <td>${s.userAgent || '—'}</td>
        <td>${s.ip || '—'}</td>
        <td>${formatoFecha(s.ultimaActividad)}</td>
        <td>${s.actual ? 'Este dispositivo' : '—'}</td>
        <td>${s.actual ? '' : `<button class="btn-small" onclick="revocarSesion(${s.id})">Cerrar</button>`}</td>
      </tr>
    `).join('') || '<tr><td colspan="5">Sin sesiones activas</td></tr>';
  } catch (err) {
    $('sesionesBody').innerHTML = `<tr><td colspan="5">${err.message}</td></tr>`;
  }
  render2fa();
}

/** Dibuja el bloque del segundo factor según su estado */
function render2fa() {
  const cont = $('seg2fa');
  if (usuario.totpEnabled) {
    cont.innerHTML = `
      <p class="card-sub">Verificación en dos pasos <strong>ACTIVA</strong>.
      Cada ingreso exigirá un código de su app de autenticación.</p>
      <button id="btnDesactivar2fa" class="btn-outline">Desactivar 2FA</button>`;
    $('btnDesactivar2fa').addEventListener('click', async () => {
      const pass = prompt('Para desactivar la verificación en dos pasos ingrese su contraseña:');
      if (!pass) return;
      try {
        await peticion('/auth/2fa/desactivar', 'POST', { password: pass });
        usuario.totpEnabled = false;
        render2fa();
        $('segMsg').textContent = 'Verificación en dos pasos desactivada';
        $('segMsg').style.color = 'var(--verde)';
      } catch (err) {
        $('segMsg').textContent = `${err.message}`;
        $('segMsg').style.color = 'var(--rojo)';
      }
    });
  } else {
    cont.innerHTML = `
      <p class="card-sub">La verificación en dos pasos está <strong>desactivada</strong>.
      Actívela con su app de autenticación (Google Authenticator, Authy...).</p>
      <button id="btnActivar2fa" class="btn-primary">Activar 2FA</button>
      <div id="qrawrap" class="hidden" style="text-align:center;margin-top:14px"></div>`;
    $('btnActivar2fa').addEventListener('click', async () => {
      try {
        const data = await peticion('/auth/2fa/iniciar', 'POST', {});
        $('qrawrap').innerHTML = `
          <img src="${data.qr}" alt="QR de autenticación" style="width:200px;height:200px;border-radius:10px">
          <p class="card-sub">Escanee con su app e ingrese el código de 6 dígitos:</p>
          <input type="text" id="faConfirmCodigo" maxlength="6" placeholder="000000" style="text-align:center;letter-spacing:4px">
          <button id="btnConfirmar2fa" class="btn-primary" style="margin-top:8px">Confirmar</button>
          <p class="card-sub">Si no puedes escanear, ingresa manualmente: <code>${data.secreto}</code></p>`;
        $('qrawrap').classList.remove('hidden');
        $('btnConfirmar2fa').addEventListener('click', async () => {
          try {
            const r = await peticion('/auth/2fa/confirmar', 'POST', { codigo: $('faConfirmCodigo').value.trim() });
            usuario.totpEnabled = true;
            localStorage.setItem('omnicash_usuario', JSON.stringify(usuario));
            sessionStorage.setItem('omnicash_usuario', JSON.stringify(usuario));
            render2fa();
            $('segMsg').textContent = 'Verificación en dos pasos activada';
            $('segMsg').style.color = 'var(--verde)';
          } catch (err) {
            $('segMsg').textContent = `${err.message}`;
            $('segMsg').style.color = 'var(--rojo)';
          }
        });
      } catch (err) {
        $('segMsg').textContent = `${err.message}`;
        $('segMsg').style.color = 'var(--rojo)';
      }
    });
  }
}

/** Configura los botones de gestión de sesiones */
function configurarSeguridad() {
  $('btnCerrarSesiones').addEventListener('click', async () => {
    try {
      await peticion('/auth/sesiones', 'DELETE', {});
      $('segMsg').textContent = 'Se cerró la sesión en los demás dispositivos';
      $('segMsg').style.color = 'var(--verde)';
      cargarSeguridad();
    } catch (err) {
      $('segMsg').textContent = `${err.message}`;
      $('segMsg').style.color = 'var(--rojo)';
    }
  });
}

/** Revoca una sesión puntual (función global usada en la tabla) */
window.revocarSesion = async (id) => {
  try {
    await peticion(`/auth/sesiones/${id}`, 'DELETE', {});
    cargarSeguridad();
  } catch (err) { alert(err.message); }
};

// ============================================================
// VISTA TRABAJADOR (soporte)
// ============================================================

/** Lista clientes del banco para soporte */
async function cargarClientes() {
  try {
    const data = await peticion('/admin/clientes');
    $('clientesBody').innerHTML = data.clientes.map(c => `
      <tr>
        <td>${c.name}</td>
        <td>${c.email}</td>
        <td>${c.cuenta ? c.cuenta.cci : '—'}</td>
        <td>${c.cuenta ? formatoCreditos(c.cuenta.balance) : '—'}</td>
        <td><span class="badge ${c.state}">${c.state}</span></td>
      </tr>
    `).join('') || '<tr><td colspan="5">Sin clientes</td></tr>';
  } catch (err) {
    $('clientesBody').innerHTML = `<tr><td colspan="5">${err.message}</td></tr>`;
  }
}

/** Configura el formulario de depósito en ventanilla */
function configurarDeposito() {
  $('depositoForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await conReauth('Depósito en ventanilla.', async (rt) => {
      try {
        const data = await peticion('/cuenta/deposito', 'POST', {
          cci: $('depositoCuenta').value.trim(),
          monto: Number($('depositoMonto').value),
        }, rt);
        $('depositoMsg').textContent = `Depósito de ${formatoCreditos(data.cuenta.balance)} — saldo actual: ${formatoCreditos(data.cuenta.balance)}`;
        $('depositoMsg').style.color = 'var(--verde)';
        $('depositoCuenta').value = ''; $('depositoMonto').value = '';
        cargarClientes();
      } catch (err) {
        $('depositoMsg').textContent = `${err.message}`;
        $('depositoMsg').style.color = 'var(--rojo)';
      }
    });
  });
}

// ============================================================
// VISTA ADMINISTRADOR SUPREMO
// ============================================================

/** Carga métricas, usuarios, auditoría y transacciones */
async function cargarDashboardAdmin() {
  try {
    const data = await peticion('/admin/dashboard');
    $('mUsuarios').textContent = data.metricas.totalUsuarios;
    $('mClientes').textContent = data.metricas.totalClientes;
    $('mTrabajadores').textContent = data.metricas.totalTrabajadores;
    $('mCuentas').textContent = data.metricas.totalCuentas;
    $('mActivos').textContent = formatoCreditos(data.metricas.activosBanco);

    $('usuariosBody').innerHTML = data.usuarios.map(u => `
      <tr>
        <td>${u.name}</td>
        <td>${u.email}</td>
        <td><span class="badge ${u.role}">${u.role}</span></td>
        <td><span class="badge ${u.state}">${u.state}</span></td>
        <td>${u.cuenta ? u.cuenta.cci : '—'}</td>
        <td>${u.cuenta ? formatoCreditos(u.cuenta.balance) : '—'}</td>
        <td>
          ${u.role === 'CLIENTE' ? `
            <button class="btn-small" onclick="cambiarEstado(${u.id}, '${u.state === 'ACTIVO' ? 'BLOQUEADO' : 'ACTIVO'}')">
              ${u.state === 'ACTIVO' ? 'Bloquear' : 'Activar'}
            </button>
            <button class="btn-small rojo" onclick="eliminarCliente(${u.id})" title="Eliminar">Eliminar</button>
          ` : ''}
        </td>
      </tr>
    `).join('');

    $('auditoriaBody').innerHTML = data.auditoria.map(a => `
      <tr>
        <td>${formatoFecha(a.created_at)}</td>
        <td>${a.action}</td>
        <td>${a.detail}</td>
      </tr>
    `).join('');
  } catch (err) {
    console.error(err);
  }
}

/** Configura los controles administrativos */
function configurarAdmin() {
  // Crear trabajador
  $('crearTrabajadorForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await conReauth('Crear trabajador.', async (rt) => {
      try {
        await peticion('/admin/trabajadores', 'POST', {
          name: $('twName').value.trim(),
          email: $('twEmail').value.trim(),
          password: $('twPassword').value,
          whatsapp: $('twWhatsapp').value.trim(),
        }, rt);
        $('twMsg').textContent = 'Trabajador creado correctamente';
        $('twMsg').style.color = 'var(--verde)';
        $('crearTrabajadorForm').reset();
        cargarDashboardAdmin();
      } catch (err) {
        $('twMsg').textContent = `${err.message}`;
        $('twMsg').style.color = 'var(--rojo)';
      }
    });
  });

  cargarYapePendientes();
}

/** Carga las solicitudes Yape pendientes (admin) */
async function cargarYapePendientes() {
  try {
    const data = await peticion('/admin/yape/pendientes');
    $('yapePendientesBody').innerHTML = data.depositos.map(d => `
      <tr>
        <td>#${d.id}</td>
        <td>${d.clienteNombre}</td>
        <td>${d.clienteDni}</td>
        <td><strong>${formatoCreditos(d.amount)}</strong></td>
        <td>${d.payerPhone || '—'}</td>
        <td>${d.operacion || '—'}</td>
        <td>${formatoFecha(d.createdAt)}</td>
        <td>
          <button class="btn-small" onclick="resolverYape(${d.id}, 'ACREDITAR')">Acreditar</button>
          <button class="btn-small rojo" onclick="resolverYape(${d.id}, 'RECHAZAR')">Rechazar</button>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="8">Sin solicitudes pendientes</td></tr>';
  } catch (err) {
    $('yapePendientesBody').innerHTML = `<tr><td colspan="8">${err.message}</td></tr>`;
  }
}

/**
 * Confirma o rechaza un depósito Yape (función global usada en la tabla).
 * Doble verificación: contraseña del admin + código OTP enviado a su correo.
 */
window.resolverYape = async (id, accion) => {
  const password = prompt('Ingrese su contraseña de administrador:');
  if (!password) return;
  try {
    const paso1 = await peticion(`/admin/yape/${id}/autorizar`, 'POST', { password });
    const codigo = prompt(`Revise su correo (${paso1.correo}). Ingrese el código de 6 dígitos:`);
    if (!codigo) return;
    const paso2 = await peticion(`/admin/yape/${id}/finalizar`, 'POST', { codigo: codigo.trim(), accion });
    $('yapeAdminMsg').textContent = `${paso2.mensaje}`;
    $('yapeAdminMsg').style.color = 'var(--verde)';
    cargarYapePendientes();
  } catch (err) {
    $('yapeAdminMsg').textContent = `${err.message}`;
    $('yapeAdminMsg').style.color = 'var(--rojo)';
  }
};

/** Bloquea o activa un cliente (función global usada en la tabla) */
window.cambiarEstado = async (id, estado) => {
  await conReauth(`Cambiar estado del cliente (${estado}).`, async (rt) => {
    try {
      await peticion(`/admin/usuarios/${id}/estado`, 'POST', { estado }, rt);
      cargarDashboardAdmin();
    } catch (err) { alert(err.message); }
  });
};

/** Elimina un cliente (función global usada en la tabla) */
window.eliminarCliente = async (id) => {
  if (!confirm('¿Eliminar permanentemente a este cliente y su cuenta?')) return;
  await conReauth('Eliminar cliente.', async (rt) => {
    try {
      await peticion(`/admin/usuarios/${id}`, 'DELETE', {}, rt);
      cargarDashboardAdmin();
    } catch (err) { alert(err.message); }
  });
};

// ============================================================
// ACTUALIZACIÓN AUTOMÁTICA (sin recargar la página)
// ============================================================

/**
 * Recarga los datos en segundo plano cada 10 segundos.
 * Se pausa mientras hay un modal abierto o la pestaña está oculta,
 * para no interrumpir al usuario mientras escribe o confirma operaciones.
 */
let refrescoEnCurso = false;
async function refrescarDatosAutomatico() {
  if (refrescoEnCurso || document.hidden) return;
  if (document.querySelector('.modal:not(.hidden)')) return; // modal abierto: pausa
  refrescoEnCurso = true;
  try {
    if (usuario.role === 'CLIENTE') {
      await Promise.all([cargarMiCuenta(), cargarDepositosYape()]);
    } else if (usuario.role === 'TRABAJADOR') {
      await cargarClientes();
    } else if (usuario.role === 'ADMIN') {
      await Promise.all([cargarDashboardAdmin(), cargarYapePendientes()]);
    }
  } catch { /* el error ya se muestra en cada vista */ }
  refrescoEnCurso = false;
}

setInterval(refrescarDatosAutomatico, 10000);