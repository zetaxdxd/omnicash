# AGENTS.md — OmniCash

## Regla de oro (obligatoria)
Para CADA tarea que pida el usuario, seguir este orden:
1. Implementar el cambio.
2. Auditar el proceso COMPLETO (flujo de extremo a extremo, no solo leer código):
   verificar que funciona de punta a punte y reportar hallazgos / bugs encontrados.
3. Esperar el VISTO BUENO explícito del usuario ANTES de subir nada.
4. Solo tras el visto bueno: `git add -A && git commit -m "descripción" && git push origin main`.
5. Verificar que Render redespliegue: `https://omnicash.onrender.com/api/health` debe responder `ok:true`.
6. Verificar los cambios en producción (login y flujo afectado).

Nunca subir cambios sin el visto bueno del usuario.
Nunca dejar cambios aprobados sin subir al final de una sesión de trabajo.

## Entorno
- Producción: Render (`https://omnicash.onrender.com`) + PostgreSQL Neon (ver `DATABASE_URL` en Render → Environment).
- Local: SQLite (`data/omnicash.db`) si `DATABASE_URL` está vacío en `.env`.
- Credenciales admin (seed): `fernandezllanoselias@gmail.com` / `Admin12345` — cambiar en producción.

## Comandos útiles
- Correr local: `npm run dev` (puerto 4000)
- Semilla de datos: `npm run seed` (crea el admin si no existe)
- Tests: `npm test`
- Desplegar: solo `git push origin main` (Render hace el resto)
