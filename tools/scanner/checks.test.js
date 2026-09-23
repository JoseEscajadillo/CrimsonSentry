import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runChecks, verdict, spendableNative } from './checks.js';

const VAULT = 'CB5X32K4QZLPO6YZYE2KWZW2QAXXUT5AJSJJFF2OP73IYCFMCYZJEBXG';
const OWNER = 'GBJ6ET45Z564CPAGJF6FHATLNW335YNYFDI3MWZK45CP5HH44G3I73AS';
const AGENT = 'GCJYDHTA7IJ3MTFTKFOWIJL7JT72ITLOEWFXNLJIRWZR4YDMJLM3DFLV';
const SHOP = 'GBJ3X4V6XOHZFMQNT7UR4DYBYSRWVQNVSPC6K7AYXILPREZDF5LGFPSK';
const SAC = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
const WASM = '8f063bdcefa17824502ed78aa6cecca68727fad558c8fb26de2c69d8257c6bef';
const NOW = Date.parse('2026-09-23T08:00:00Z');

const account = (id, xlmBalance, extra = {}) => ({
  account_id: id,
  balances: [{ asset_type: 'native', balance: xlmBalance, selling_liabilities: '0.0000000' }],
  subentry_count: 0,
  signers: [{ key: id, weight: 1 }],
  thresholds: { low_threshold: 0, med_threshold: 0, high_threshold: 0 },
  ...extra,
});

/** Snapshot of the live testnet deployment on 2026-09-23 (after the demo run). */
function liveDeployment() {
  return {
    status: {
      owner: OWNER, agent: AGENT, token: SAC, paused: false,
      policy: { tx_limit: 100000000n, daily_limit: 250000000n, max_payments_per_day: 5, allowlist: [SHOP] },
      balance: 800000000n, spent_last_24h: 200000000n, payments_last_24h: 2, remaining_last_24h: 50000000n,
    },
    contractInfo: { wasmSha256: WASM, liveUntil: 5343336, latestLedger: 4825514 },
    expectedWasm: WASM,
    nativeSac: SAC,
    baseReserve: 5000000n,
    agentAccount: account(AGENT, '9999.9657908'),
    ownerAccount: account(OWNER, '9891.3169659'),
    allowlistAccounts: { [SHOP]: true },
    agentActivity: {
      transactions: [
        { hash: '89f54fceaeb9', successful: false, created_at: '2026-09-23T07:25:42Z' },
        { hash: 'c1fa5ea6a2d2', successful: true, created_at: '2026-09-23T07:25:37Z' },
      ],
      operations: [
        { type: 'invoke_host_function', source_account: AGENT, transaction_successful: true,
          asset_balance_changes: [{ from: VAULT, to: SHOP, amount: '10.0000000' }] },
        { type: 'create_account', source_account: 'GFRIENDBOT', account: AGENT, transaction_successful: true },
      ],
    },
    feeBuffer: 20000000n,
    now: NOW,
  };
}

/** Same vault after the fixes the scanner recommends. */
function hardened() {
  const d = liveDeployment();
  d.agentAccount = account(AGENT, '3.0000000');
  d.ownerAccount = account(OWNER, '9891.3169659', {
    signers: [{ key: OWNER, weight: 1 }, { key: 'GBACKUP', weight: 1 }],
    thresholds: { low_threshold: 2, med_threshold: 2, high_threshold: 2 },
  });
  d.status.spent_last_24h = 0n;
  d.status.payments_last_24h = 0;
  d.agentActivity.transactions = [];
  return d;
}

const byId = (results) => Object.fromEntries(results.map((r) => [r.id, r.color]));

test('live deployment: red because the agent keeps its Friendbot XLM', () => {
  const r = runChecks(liveDeployment());
  const c = byId(r);
  assert.equal(c.C1, 'red');
  assert.equal(c.C8, 'yellow'); // 20/25 XLM = 80%
  assert.equal(c.C9, 'yellow'); // the parallel-spend revert
  assert.equal(c.C12, 'yellow'); // single-key owner
  assert.equal(verdict(r), 'red');
});

test('hardened setup: every check green', () => {
  const r = runChecks(hardened());
  assert.deepEqual(r.filter((x) => x.color !== 'green').map((x) => `${x.id}: ${x.detail}`), []);
  assert.equal(verdict(r), 'green');
});

test('spendable balance subtracts the reserve and liabilities', () => {
  const acc = account(AGENT, '10.0000000', { subentry_count: 2 });
  acc.balances[0].selling_liabilities = '1.0000000';
  // 10 − (2 + 2) × 0.5 − 1 = 7 XLM
  assert.equal(spendableNative(acc, 5000000n), 70000000n);
});

test('agent inside its own allowlist is red', () => {
  const d = hardened();
  d.status.policy.allowlist = [SHOP, AGENT];
  assert.equal(byId(runChecks(d)).C5, 'red');
});

test('agent that is also the owner is red', () => {
  const d = hardened();
  d.status.owner = AGENT;
  assert.equal(byId(runChecks(d)).C4, 'red');
});

test('direct payments by the agent are a bypass, refunds to the owner are not', () => {
  const d = hardened();
  d.agentActivity.operations.push({ type: 'payment', source_account: AGENT, to: OWNER, transaction_successful: true });
  assert.equal(byId(runChecks(d)).C10, 'green');
  d.agentActivity.operations.push({ type: 'payment', source_account: AGENT, to: 'GATTACKER', transaction_successful: true });
  assert.equal(byId(runChecks(d)).C10, 'red');
});

test('three or more on-chain rejections in 24h is red', () => {
  const d = hardened();
  d.agentActivity.transactions = ['a', 'b', 'c'].map((h) => ({ hash: h.repeat(8), successful: false, created_at: '2026-09-23T07:59:00Z' }));
  assert.equal(byId(runChecks(d)).C9, 'red');
  d.agentActivity.transactions.forEach((tx) => { tx.created_at = '2026-09-21T00:00:00Z'; });
  assert.equal(byId(runChecks(d)).C9, 'green');
});

test('code integrity: mismatch red, no reference yellow', () => {
  const d = hardened();
  d.expectedWasm = 'deadbeef';
  assert.equal(byId(runChecks(d)).C13, 'red');
  d.expectedWasm = null;
  assert.equal(byId(runChecks(d)).C13, 'yellow');
});

test('archived instance is red, close to expiry is yellow', () => {
  const d = hardened();
  d.contractInfo.liveUntil = d.contractInfo.latestLedger - 1;
  assert.equal(byId(runChecks(d)).C15, 'red');
  d.contractInfo.liveUntil = d.contractInfo.latestLedger + 17280 * 3;
  assert.equal(byId(runChecks(d)).C15, 'yellow');
});

test('paused vault and a broke owner are flagged', () => {
  const d = hardened();
  d.status.paused = true;
  assert.equal(byId(runChecks(d)).C11, 'yellow');
  d.ownerAccount = account(OWNER, '1.2000000');
  assert.equal(byId(runChecks(d)).C11, 'red');
});
