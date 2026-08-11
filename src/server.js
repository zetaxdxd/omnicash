/**
 * OmniCash - Punto de entrada del servidor.
 * Levanta la aplicación Express con la configuración del entorno.
 */

import { config } from './infrastructure/config.js';
import { createApp } from './interfaces/http/app.js';
import { usaPostgres } from './infrastructure/database/connection.js';

const app = createApp();

app.listen(config.port, () => {
  console.log('=================================================');
  console.log('  OMNICASH — Banco Digital (MVP)');
  console.log('=================================================');
  console.log(`  Servidor:      http://localhost:${config.port}`);
  console.log(`  Base de datos:  ${usaPostgres ? 'PostgreSQL (' + config.databaseUrl.split('@')[1] + ')' : 'SQLite (' + config.dbPath + ')'}`);
  console.log(`  Limite cajero:  ${config.atmDailyLimit} creditos/dia`);
  console.log(`  Comision cajero: ${config.atmFee * 100}%`);
  console.log('=================================================');
});