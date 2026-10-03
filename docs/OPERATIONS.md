# Operación y desarrollo

## Requisitos

- Rust 1.91 o posterior y target `wasm32v1-none`.
- Stellar CLI 28 o posterior.
- Node.js 22.12 o posterior.
- Bash para los scripts de despliegue y demos.

En la máquina Windows usada durante el desarrollo, `. .\scripts\env.ps1` configura las rutas locales. En Git Bash, `source scripts/env.sh`. Los scripts pueden no requerir configuración en otros sistemas.

## Validación local

```bash
cargo fmt --all -- --check
cargo clippy --all-targets -- -D warnings
cargo test
cargo build --target wasm32v1-none --release
cd tools
npm ci
npm test
```

Para el WASM de despliegue, compila con `stellar contract build`; el comando prepara los artefactos y metadatos que espera la red. CI usa una compilación WASM como comprobación adicional.

## Despliegue en testnet

```bash
bash scripts/deploy-testnet.sh
bash scripts/demo-testnet.sh
```

El primer comando crea las identidades CLI que falten, despliega un vault y escribe sus identificadores públicos en `evidence/deployment.env`. Ese archivo es temporal, está excluido de Git y se genera de nuevo en cada entorno. Las claves privadas permanecen en el keystore local de Stellar CLI.

Los scripts interactúan con Stellar testnet y crean transacciones. Revisa sus parámetros y la cuenta de origen antes de ejecutarlos. No los adaptes a mainnet sin una revisión de seguridad independiente.

## Rotación del dueño

1. El dueño actual invoca `propose_owner` con la dirección nueva.
2. Verifica la propuesta con `get_pending_owner` y revisa el evento publicado.
3. La nueva dirección invoca `accept_owner` y firma la transacción para asumir el control.
4. Si la propuesta es incorrecta, el dueño actual invoca `cancel_owner_change` antes de la aceptación.

La propuesta no transfiere autoridad por sí sola. La dirección nueva debe estar activa y poder pagar las comisiones de aceptación.

## Demos

La demo completa crea un agente y un vault nuevos:

```bash
bash scripts/demo-agente.sh
```

La demo corta se prepara antes de una presentación y se ejecuta durante ella:

```bash
bash scripts/demo-corta.sh prep
bash scripts/demo-corta.sh live
```

Los archivos `.env` y logs auxiliares se generan localmente y están ignorados por Git. Los informes Markdown de evidencia se pueden revisar y compartir, verificando primero que no contengan información privada.

## Auditoría estática

En Linux, WSL o macOS instala Scout y ejecuta:

```bash
cargo install --locked cargo-dylint dylint-link cargo-scout-audit@0.3.16
bash scripts/scout.sh
```

El script contiene los ajustes necesarios para ejecutar Scout 0.3.16 con el SDK del proyecto. CI falla si el contrato no puede analizarse o si Scout encuentra hallazgos críticos.

## Integración continua

El flujo `.github/workflows/ci.yml` ejecuta Rust fmt, Clippy, pruebas, compilación WASM, pruebas Node.js y auditoría Scout. Las transacciones de testnet no forman parte de CI.
