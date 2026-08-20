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
```

`pnpm dev` inicia el portal. Las variables `VITE_*` se mantienen en el
archivo `.env.local` de la raíz y son compartidas por las aplicaciones Vite.
