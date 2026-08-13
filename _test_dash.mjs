import { obtenerDashboardAdmin } from './src/application/use-cases/obtenerDashboardAdmin.js';
try {
  const d = await obtenerDashboardAdmin();
  console.log('metricas:', JSON.stringify(d.metricas));
  console.log('usuarios devueltos:', d.usuarios.length);
  d.usuarios.forEach(u => console.log('  - id=' + u.id + ' | ' + u.name + ' | tel=' + JSON.stringify(u.phone) + ' | rol=' + u.role));
} catch (e) {
  console.error('FAIL ->', e.message);
}
