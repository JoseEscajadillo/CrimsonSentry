# CrimsonSentry

> Los agentes de IA ya mueven dinero solos, pero nadie revisa si su wallet tiene límites de seguridad.
> CrimsonSentry pone un **contrato-guardián en Soroban** entre el agente y su dinero: cualquier pago fuera de las reglas **revierte on-chain**, comprobable en Stellar testnet.

**Stellar Odyssey Perú · Track 04 — Research, Cryptography & Security Architecture** (cruzado con Track 01, AI Agents)

Equipo: Santiago Fabrizio Lindley Santivañez · José Fernando Escajadillo Gaspar · Cesar Adrian Guevara Salcedo — Licencia [MIT](LICENSE)

📐 Esquema completo, con diagramas de flujo: [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md)


## ✅ Evidencia en Stellar testnet

**Contrato Policy Vault:** [`CB5X32K4QZLPO6YZYE2KWZW2QAXXUT5AJSJJFF2OP73IYCFMCYZJEBXG`](https://stellar.expert/explorer/testnet/contract/CB5X32K4QZLPO6YZYE2KWZW2QAXXUT5AJSJJFF2OP73IYCFMCYZJEBXG)

Política desplegada: máx. 10 XLM por pago, 25 XLM por 24h móviles, máx. 5 pagos en 24h, un solo comercio en la allowlist. El vault se fondeó con 100 XLM de testnet.

| Escenario | Resultado on-chain | Transacción |
|---|---|---|
| Deploy del contrato | ✅ | [`83a8576b…`](https://stellar.expert/explorer/testnet/tx/83a8576b01aeae5a858a61fe83452275f87aaa7c2daa4e29f9bcf7b242634954) |
| Pago válido de 10 XLM al comercio permitido | ✅ SUCCESS (ledger 4824948) | [`353b05e3…`](https://stellar.expert/explorer/testnet/tx/353b05e366f9e4491b87747bfea9e5e624a33307c413470df5926d6cdc990671) |
| Ataque de pagos paralelos — pago A de 10 XLM (acumulado 20) | ✅ SUCCESS (ledger 4824950) | [`c1fa5ea6…`](https://stellar.expert/explorer/testnet/tx/c1fa5ea6a2d240a82fe25a39b98a1f8355921b76564b1d55696f4260b467971d) |
| Ataque de pagos paralelos — pago B de 10 XLM (acumulado 30 > 25) | ⛔ **FAILED — `Error(Contract, #3)` OverDailyLimit** (ledger 4824951) | [`89f54fce…`](https://stellar.expert/explorer/testnet/tx/89f54fceaeb9907fd1c8bbe63663a4b4cfd3fc9b0bbe94ed5d6481832add745b) |
| Pago de 15 XLM (límite por pago 10) | 🛑 rechazado en simulación: `#2` | — |
| Pago a una dirección fuera de la allowlist | 🛑 rechazado en simulación: `#1` | — |
| Pago con el vault en pausa (kill switch) | 🛑 rechazado en simulación: `#7` | pausa [`2a228d6d…`](https://stellar.expert/explorer/testnet/tx/2a228d6d3829271f3bf433da187124c66a7996f5eb4e2de559501f5632dbaf3e) |

El pago B pasó la simulación por sí solo, porque se construyó cuando solo había 10 XLM gastados. On-chain, el vault vio el acumulado real y revirtió: **las validaciones fuera de la cadena se pueden burlar; la regla on-chain no.** Detalle completo en [`evidence/testnet-evidence.md`](evidence/testnet-evidence.md).

---

## Cómo funciona

```
 Agente IA ──pay(destino, monto)──▶  Policy Vault (Soroban)  ──transfer──▶ Comercio
 (solo firma pagos)                   ├─ allowlist de destinos
                                      ├─ límite por pago
                                      ├─ límite en 24h MÓVILES
                                      ├─ máx. N pagos en 24h
                                      └─ pausa (kill switch)
 Dueño humano ──set_policy / pause / set_agent / withdraw──▶ Vault
```

Los fondos viven en el contrato, no en la wallet del agente. El agente solo puede llamar a `pay`; si viola una regla, el contrato hace `panic_with_error!` y **toda la transacción revierte**.

### API del contrato

| Función | Quién firma | Qué hace |
|---|---|---|
| `__constructor(owner, agent, token, policy)` | — (deploy) | Configuración única; no existe `initialize()`, así que no se puede reinicializar |
| `pay(destino, monto)` | agente | Paga si cumple las 4 reglas y el vault no está en pausa |
| `set_policy(policy)` | dueño | Reemplaza la política de forma atómica, validándola |
| `pause()` / `unpause()` | dueño | Kill switch: bloquea todos los pagos del agente |
| `set_agent(new_agent)` | dueño | Rota una clave de agente comprometida |
| `withdraw(to, amount)` | dueño | Recupera fondos, incluso en pausa |
| `get_policy()` / `get_status()` | — (lectura) | Estado completo para el escáner y el dashboard |

`Policy = { tx_limit, daily_limit, max_payments_per_day, allowlist }`

### Códigos de error (lo que se ve en Stellar Expert)

| Código | Error | Causa |
|---|---|---|
| `#1` | `NotAllowlisted` | Destino fuera de la allowlist |
| `#2` | `OverTxLimit` | Pago mayor al límite por transacción |
| `#3` | `OverDailyLimit` | Supera el límite de las últimas 24h |
| `#4` | `ArithmeticOverflow` | Overflow en la suma del gasto |
| `#5` | `InvalidAmount` | Monto ≤ 0 |
| `#6` | `InvalidPolicy` | Política incoherente (límites ≤ 0, `tx_limit > daily_limit`, allowlist > 32, etc.) |
| `#7` | `Paused` | El dueño activó el kill switch |
| `#8` | `TooManyPayments` | Superó el máximo de pagos en 24h |
| `#9` | `NotInitialized` | Estado corrupto (no debería ocurrir) |

Cada operación exitosa emite un evento (`paid`, `policy_updated`, `paused_changed`, `agent_rotated`, `withdrawn`), que el escáner y el dashboard pueden indexar.

---

## Decisiones de seguridad

| Riesgo | Mitigación |
|---|---|
| Falta de `require_auth()` (CRÍTICO) | `pay` exige la firma del agente; todo lo administrativo, la del dueño. Hay tests que verifican quién firma y que nada funciona sin firmas |
| Reinicialización (CRÍTICO) | `__constructor` en lugar de `initialize()` |
| Overflow (ALTO) | `checked_add` / `checked_sub` más `overflow-checks = true` en release |
| Colisión de claves (ALTO) | `enum DataKey` con `#[contracttype]`, una variante por dato |
| TTL (MEDIO) | `extend_ttl` en cada función que toca storage |
| Montos negativos o cero | Rechazados explícitamente (`#5`), sin depender de que el token falle |
| Doble gasto en la medianoche | Ventana **móvil** de 24h, no día calendario (test `midnight_boundary_cannot_double_the_daily_limit`) |
| Agente desbocado con muchos micro-pagos | `max_payments_per_day` (`#8`) |
| Agente comprometido | `pause`, `set_agent` y `withdraw` para el dueño |
| DoS por bucles sin límite | Allowlist ≤ 32 y registro de gastos ≤ 100 entradas |

### Auditoría estática — `cargo scout-audit`

Resultado: **0 críticos · 1 medio (aceptado) · 0 menores · 5 mejoras (falsos positivos)**. El reporte completo está en [`docs/scout-report.md`](docs/scout-report.md).

| Hallazgo | Nivel | Veredicto |
|---|---|---|
| `dynamic_storage`: `SpendLog` es un `Vec` en storage persistente | Medio | **Riesgo aceptado.** El vector está acotado (≤ `max_payments_per_day` ≤ 100 entradas, unos 4 KB como máximo, muy por debajo del límite de 64 KB por entrada), se poda en cada pago y solo `pay`, tras `require_auth` del agente, puede escribirlo. Guardarlo como un `Vec` es lo que permite una ventana móvil de 24h exacta |
| `storage_change_events` ×5 (`pay`, `set_policy`, `pause`, `unpause`, `set_agent`) | Mejora | **Falso positivo.** Las cinco funciones emiten eventos con `#[contractevent]` (SDK ≥ 23), que el detector no reconoce. El test `every_state_change_emits_an_event` lo demuestra |
| ~~`dos_unexpected_revert_with_storage`~~ en `window()` | ~~Medio~~ | **Corregido**: la ventana ahora se calcula con `slice` sobre el log ordenado, sin `push_back` |

Scout 0.3.16 no compila `soroban-sdk 28` tal como viene; [`scripts/scout.sh`](scripts/scout.sh) aplica dos ajustes solo para la auditoría, sin tocar el contrato, y explica por qué.

```bash
cargo install --locked cargo-dylint dylint-link cargo-scout-audit   # una vez (Linux/WSL/macOS)
bash scripts/scout.sh
```

### Limitaciones conocidas (dichas con honestidad)

1. **Arquitectura A (MVP, este repo):** el agente llama explícitamente al vault. Si la cuenta del agente tiene saldo propio, puede pagar **sin pasar por el vault**. Por eso la seguridad exige que el dinero esté en el vault, y ese es el primer chequeo en rojo del escáner.
2. **x402 y MPP:** estos protocolos firman transferencias directamente desde la cuenta del agente (*auth-entry signing*), así que la arquitectura A **no las intercepta**. La **arquitectura B (objetivo)** convierte la wallet del agente en una *contract account* cuyo `__check_auth` aplica esta misma política; así sí es compatible con x402 y MPP. En el modo *Channel* de MPP, la política debe limitar también el monto de apertura del canal.

---

## Mapeo al OWASP Top 10 for Agentic Applications (2026)

| Riesgo OWASP | Qué aporta CrimsonSentry |
|---|---|
| ASI01 Agent Goal Hijack | Un agente con prompt inyectado sigue atado a la allowlist y a los límites on-chain |
| ASI02 Tool Misuse & Exploitation | La herramienta "pagar" tiene límites que el propio agente no puede cambiar |
| ASI03 Identity & Privilege Abuse | Separación agente/dueño; el agente no puede tocar la política ni retirar fondos |
| ASI08 Cascading Failures | Límites de monto y de frecuencia cortan un bucle de pagos |
| ASI10 Rogue Agents | Kill switch, rotación de clave y retiro de fondos por el dueño |

---

## Desarrollo

### Requisitos

- Rust ≥ 1.91 con el target `wasm32v1-none`
- `stellar-cli` ≥ 28 (testnet corre el protocolo 28, `soroban-sdk 28.0.0`)

En la PC de desarrollo (Windows) el toolchain está en `D:\Rust`. Carga el entorno con:

```bash
source scripts/env.sh        # Git Bash
```
```powershell
. .\scripts\env.ps1          # PowerShell
```

> **Windows con usuario con tilde** (`C:\Users\José`): `wasm-opt` falla con *"Failed to write module"* si la carpeta temporal tiene caracteres no ASCII. Los scripts `env.*` apuntan `TMP`/`TEMP` a `D:\Rust\tmp`.

### Tests

```bash
cargo test
```

Son 18 tests, que cubren:
- los 4 escenarios del plan original;
- la ventana móvil y el caso de la medianoche;
- el límite de frecuencia de pagos;
- la pausa, el retiro y la rotación del agente;
- quién firma cada función y que nada funciona sin firmas;
- la validación de políticas y el constructor;
- `get_status`;
- que cada cambio de estado emite un evento.

### Build

```bash
stellar contract build       # -> target/wasm32v1-none/release/policy_vault.wasm
```

### Deploy y demo en testnet

```bash
bash scripts/deploy-testnet.sh   # crea identidades cs-owner / cs-agent / cs-shop, despliega y fondea 100 XLM
bash scripts/demo-testnet.sh     # corre los escenarios y escribe evidence/testnet-evidence.md
```

La demo produce:
1. **Pago válido**: tx SUCCESS.
2. **Pago sobre el límite / destino no permitido**: bloqueado en la simulación, así que nunca llega a la red.
3. **Ataque de gasto paralelo**: se preparan dos pagos de 10 XLM; cada uno por separado pasa la simulación (10 + 10 ≤ 25), pero on-chain el vault ve el acumulado (30 > 25) y **el segundo revierte con `Error(Contract, #3)`**. Esa es la **tx FAILED con hash en Stellar Expert** que pide el jurado, y muestra por qué las verificaciones fuera de la cadena no bastan.
4. **Kill switch**: el dueño pausa y el agente queda bloqueado.

---

## Roadmap

- [x] Policy Vault con tests (Días 1–2)
- [x] `cargo scout-audit`: 0 críticos (hallazgos revisados arriba)
- [x] Deploy en testnet más evidencia (Día 3)
- [ ] Escáner CLI: lee la cuenta del agente vía Horizon (saldo fuera del vault, firmantes, umbrales) y el vault vía Stellar RPC (`get_status`), y reporta un semáforo con el mapeo OWASP (Día 4)
- [ ] Agente demo con un prompt inyectado (Día 5)
- [ ] Arquitectura B: *contract account* con `__check_auth` (post-hackathon)
