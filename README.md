<p align="center"><img src="docs/logo.jpg" alt="CrimsonSentry" width="440"></p>

# CrimsonSentry

CrimsonSentry limita los pagos que un agente puede ejecutar en Stellar. El proyecto combina un contrato Soroban que custodia los fondos y aplica una política en cada pago con un escáner de solo lectura que revisa la configuración del agente y del vault.

El contrato impone una lista de destinos permitidos, un límite por pago, un límite móvil de 24 horas y un máximo de pagos por ventana. El dueño puede pausar los pagos, rotar la clave del agente y retirar los fondos.

**Estado:** prototipo de hackathon para Stellar testnet. No está auditado para producción ni debe custodiar fondos reales.

**Equipo:** Santiago Fabrizio Lindley Santivañez, José Fernando Escajadillo Gaspar y Cesar Adrian Guevara Salcedo. Licencia [MIT](LICENSE).

- [Demostración](https://www.youtube.com/watch?v=lgQYx48JnV0)
- [Presentación](https://www.youtube.com/watch?v=Lhr5abKy-eI)
- [Arquitectura](docs/ARQUITECTURA.md)
- [Modelo de amenazas](docs/SECURITY.md)
- [Guía del escáner](docs/SCANNER.md)
- [Operación y desarrollo](docs/OPERATIONS.md)

## Componentes

| Componente | Función | Código |
|---|---|---|
| Policy Vault | Custodia XLM y aplica la política on-chain. | [`contracts/policy-vault`](contracts/policy-vault) |
| Escáner | Evalúa 16 controles a partir de datos de Soroban RPC y Horizon. | [`tools/scanner`](tools/scanner) |
| Agente de demostración | Ejecuta un escenario de pagos autorizado y adversarial. | [`tools/agent`](tools/agent) |

## Arquitectura y límites

Los fondos protegidos residen en el contrato, no en la cuenta del agente. El agente solo tiene autorización para invocar `pay`; el contrato verifica las reglas y transfiere el activo desde su propio saldo. Una operación rechazada revierte completamente.

Este diseño no impide que una clave de agente con saldo propio haga pagos directos fuera del vault. El escáner detecta ese saldo y los movimientos observables en Horizon, pero la arquitectura actual no los bloquea. La compatibilidad con protocolos que firman pagos directamente desde la cuenta del agente requiere una cuenta de contrato con `__check_auth`, que queda fuera de esta versión.

Consulta [el modelo de amenazas](docs/SECURITY.md) antes de desplegar o integrar el prototipo.

## Contrato

| Método | Autorización | Descripción |
|---|---|---|
| `pay(destino, monto)` | Agente | Paga si se cumplen la allowlist y los límites. |
| `set_policy(policy)` | Dueño | Reemplaza la política tras validarla. |
| `pause()` / `unpause()` | Dueño | Detiene o reanuda los pagos del agente. |
| `set_agent(new_agent)` | Dueño | Rota la clave del agente. |
| `propose_owner(new_owner)` / `accept_owner()` | Dueño actual / nuevo dueño | Cambia de dueño en dos pasos; el nuevo dueño debe aceptar. |
| `cancel_owner_change()` / `get_pending_owner()` | Dueño / lectura | Cancela o consulta una propuesta pendiente. |
| `withdraw(to, amount)` | Dueño | Retira fondos, incluso si el vault está pausado. |
| `get_policy()` / `get_status()` | Lectura | Devuelve la política y el estado del vault. |

La política se compone de `tx_limit`, `daily_limit`, `max_payments_per_day` y `allowlist`. La allowlist no puede incluir al dueño, al agente, al dueño propuesto ni al propio vault; dueño y agente deben ser direcciones distintas. Una propuesta solo se completa cuando firma la dirección nueva y el dueño actual puede cancelarla antes de la aceptación.

| Código | Error | Significado |
|---:|---|---|
| 1 | `NotAllowlisted` | El destino no está permitido. |
| 2 | `OverTxLimit` | El pago excede el límite por transacción. |
| 3 | `OverDailyLimit` | El gasto superaría el límite móvil de 24 horas. |
| 4 | `ArithmeticOverflow` | El cálculo del gasto excede el rango admitido. |
| 5 | `InvalidAmount` | El monto es cero o negativo. |
| 6 | `InvalidPolicy` | La política o la separación de roles no es válida. |
| 7 | `Paused` | El dueño pausó el vault. |
| 8 | `TooManyPayments` | Se alcanzó el máximo de pagos en 24 horas. |
| 9 | `NotInitialized` | Falta estado que debía crear el constructor. |
| 10 | `InvalidOwner` | El candidato a dueño coincide con otro rol o destino de pago. |
| 11 | `NoPendingOwner` | No hay un cambio de dueño pendiente. |

## Escáner

El escáner es de solo lectura. Consulta `get_status()` por Stellar RPC y obtiene actividad y datos de cuentas por Horizon. No requiere claves ni envía transacciones.

```bash
cd tools
npm ci
node scanner/scan.js --vault <CONTRACT_ID>
node scanner/scan.js --vault <CONTRACT_ID> --json
```

El código de salida es `0` para verde, `1` para amarillo, `2` para rojo y `70` si falla la consulta. Las reglas y límites de observabilidad están en [la guía del escáner](docs/SCANNER.md).

## Evidencia de testnet

El contrato y las transacciones de demostración están documentados en [`evidence/testnet-evidence.md`](evidence/testnet-evidence.md). La evidencia es histórica y puede no reflejar el estado actual de la red. El hash WASM de referencia está en [`evidence/wasm-sha256.txt`](evidence/wasm-sha256.txt).

La auditoría estática reportada por Scout se conserva en [`docs/scout-report.md`](docs/scout-report.md). El informe no sustituye una auditoría independiente; los hallazgos y sus límites están explicados en el archivo.

## Desarrollo

Requisitos: Rust 1.91 o posterior, target `wasm32v1-none`, Stellar CLI 28 o posterior y Node.js 22.12 o posterior.

```bash
cargo fmt --all -- --check
cargo clippy --all-targets -- -D warnings
cargo test
cargo build --target wasm32v1-none --release
cd tools && npm ci && npm test
```

Para compilar el artefacto destinado a la red, utiliza `stellar contract build`. Las instrucciones de entorno, despliegue y demos están en [Operación y desarrollo](docs/OPERATIONS.md). El flujo de integración continua ejecuta formato, Clippy, pruebas, compilación WASM, pruebas del escáner y auditoría estática.

## Próximos pasos

- Convertir la cuenta del agente en una cuenta de contrato con validación `__check_auth`.
- Separar el pago de comisiones del saldo de la cuenta del agente mediante un relayer.
- Evaluar un límite de retiro que complemente la rotación del dueño en dos pasos.
- Incorporar monitoreo de eventos y renovación operativa del TTL.

## Referencias

- [Documentación de contratos inteligentes de Stellar](https://developers.stellar.org/docs/build/smart-contracts/overview)
- [OWASP Top 10 for Agentic Applications 2026](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/)
