# Club Regalones

Monorepo del MVP de Club Regalones, administrado con pnpm workspaces.

## Estructura

- `apps/portal`: landing pública y futuros portales de clientes y comercios.
- `apps/terminal`: aplicación web para el tótem o terminal del comercio.
- `packages/ui`: componentes visuales compartidos.
- `packages/domain`: reglas y tipos del negocio compartidos.
- `packages/config`: configuración común del monorepo.
- `docs`: documentación y referencias visuales.

## Comandos

```bash
pnpm install
pnpm dev
pnpm dev:terminal
pnpm typecheck
pnpm lint
pnpm build
pnpm db:start
pnpm db:reset
pnpm db:test
pnpm db:lint
```

`pnpm dev` inicia el portal. Las variables `VITE_*` se mantienen en el
archivo `.env.local` de la raíz y son compartidas por las aplicaciones Vite.

## Supabase local

La configuración, las migraciones y las pruebas de base de datos viven en
`supabase/`. Los comandos locales requieren Docker Desktop u otro motor
compatible con Docker. Los cambios remotos deben aplicarse exclusivamente
mediante migraciones revisadas; no se modifican tablas de producción
manualmente desde el Dashboard.

El modelo actual usa nombres de dominio en español e implementa los Hitos A y
B del diccionario de datos. El alcance y las decisiones aplazadas se describen
en `docs/arquitectura-base-supabase.md`.
