/**
 * OmniCash — Registro de auditoría
 * Ventana exclusiva del administrador supremo: muestra la traza de
 * acciones sensibles en dos bloques por antigüedad (15 días y 3 meses),
 * con filtro rápido por acción o detalle.
 */

const $ = (id) => document.getElementById(id);
const API = '/api';

const token = localStorage.getItem('omnicash_token') || sessionStorage.getItem('omnicash_token');
const usuario = JSON.parse(localStorage.getItem('omnicash_usuario') || sessionStorage.getItem('omnicash_usuario') || 'null');

// Solo sesión activa y rol ADMIN
if (!token || !usuario || usuario.role !== 'ADMIN') {
  window.location.href = '/dashboard.html';
}

let recientes = [];
let historico = [];

function formatoFecha(iso) {
  const d = new Date(iso);
  return d.toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function escapar(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Pinta un bloque de la tabla respetando el filtro de texto */
function pintarBloque(tbodyId, resumenId, registros, filtro) {
  const texto = filtro.toLowerCase().trim();
  const lista = texto
    ? registros.filter((r) =>
        (r.action || '').toLowerCase().includes(texto) ||
        (r.detail || '').toLowerCase().includes(texto) ||
        (r.actor_name || '').toLowerCase().includes(texto)
      )
    : registros;
  $(resumenId).textContent = `${lista.length} de ${registros.length} registro(s)`;
  $(tbodyId).innerHTML = lista.map((a) => `
    <tr>
      <td>${formatoFecha(a.created_at)}</td>
      <td><span class="badge">${escapar(a.action)}</span></td>
      <td>${escapar(a.detail)}</td>
      <td>${escapar(a.actor_name || 'sistema')}</td>
    </tr>
  `).join('') || '<tr><td colspan="4" class="card-sub">Sin registros para este bloque.</td></tr>';
}

async function cargarAuditoria() {
  try {
    const res = await fetch(API + '/admin/auditoria', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401) { window.location.href = '/'; return; }
      throw new Error(data.error || 'Error del servidor');
    }
    recientes = data.recientes || [];
    historico = data.historico || [];
    const filtro = $('filtroAuditoria').value;
    pintarBloque('auditoria15', 'resumen15', recientes, filtro);
    pintarBloque('auditoria3m', 'resumen3m', historico, filtro);
  } catch (err) {
    $('resumen15').textContent = err.message;
    $('resumen3m').textContent = err.message;
  }
}

// Volver al panel
$('btnVolver').addEventListener('click', () => window.location.href = '/dashboard.html');

// Filtro en vivo
$('filtroAuditoria').addEventListener('input', () => {
  const filtro = $('filtroAuditoria').value;
  pintarBloque('auditoria15', 'resumen15', recientes, filtro);
  pintarBloque('auditoria3m', 'resumen3m', historico, filtro);
});

cargarAuditoria();
