# AGENTS.md — OmniCash

## Regla de oro (obligatoria)
Después de CUALQUIER cambio al código o configuración del proyecto:
1. `git add -A && git commit -m "descripción" && git push origin main`
2. Verificar que Render redespliegue: `https://omnicash.onrender.com/api/health` debe responder `ok:true`
3. Verificar los cambios en producción (login y flujo afectado)

Nunca dejar cambios sin subir al final de una sesión de trabajo.

## Entorno
- Producción: Render (`https://omnicash.onrender.com`) + PostgreSQL Neon (ver `DATABASE_URL` en Render → Environment).
- Local: SQLite (`data/omnicash.db`) si `DATABASE_URL` está vacío en `.env`.
- Credenciales admin (seed): `fernandezllanoselias@gmail.com` / `Admin12345` — cambiar en producción.

## Comandos útiles
- Correr local: `npm run dev` (puerto 4000)
- Semilla de datos: `npm run seed` (crea el admin si no existe)
- Tests: `npm test`
- Desplegar: solo `git push origin main` (Render hace el resto)