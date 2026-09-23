// The demo agent's only tool: a payment through the Policy Vault.
//
// Keys never enter this process. Transactions are signed by the stellar CLI
// keystore (`stellar tx sign --sign-with-key <identity>`), so the agent code
// only ever handles public data.

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  contract, rpc, xdr, Address, Operation, TransactionBuilder, SorobanDataBuilder, nativeToScVal,
} from '@stellar/stellar-sdk';

const STELLAR = process.platform === 'win32' ? 'stellar.exe' : 'stellar';

function run(cmd, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(err.trim() || `${cmd} exited ${code}`))));
    child.stdin.end(input ?? '');
  });
}

/** Resolves a CLI identity to its public key. */
export function identityAddress(identity) {
  return run(STELLAR, ['keys', 'address', identity]);
}

function contractErrorCode(text) {
  const m = /Error\(Contract, #(\d+)\)/.exec(text ?? '');
  return m ? Number(m[1]) : null;
}

export class VaultWallet {
  constructor(conn, { vaultId, identity, address }) {
    this.conn = conn;
    this.vaultId = vaultId;
    this.identity = identity;
    this.address = address;
  }

  async #client() {
    this.client ??= await contract.Client.from({
      contractId: this.vaultId,
      networkPassphrase: this.conn.passphrase,
      rpcUrl: this.conn.rpcUrl,
      publicKey: this.address,
      signTransaction: (txXdr) => this.#sign(txXdr),
    });
    return this.client;
  }

  async #sign(txXdr) {
    const signedTxXdr = await run(STELLAR, ['tx', 'sign', '--sign-with-key', this.identity, '--network', this.conn.name], txXdr);
    return { signedTxXdr, signerAddress: this.address };
  }

  /**
   * Pays through the vault. The normal path simulates first, like any wallet.
   * With { force: true }, a payment the simulation rejects is still sent, as a
   * compromised client would, so the rejection happens on-chain and leaves a
   * verifiable FAILED transaction.
   */
  async pay(to, amountStroops, { force = false } = {}) {
    const client = await this.#client();
    const tx = await client.pay({ destino: to, monto: amountStroops });
    if (!rpc.Api.isSimulationError(tx.simulation)) {
      const sent = await tx.signAndSend();
      const hash = sent.sendTransactionResponse?.hash;
      const status = sent.getTransactionResponse?.status;
      return { outcome: status === 'SUCCESS' ? 'success' : 'failed-onchain', hash, code: null };
    }
    const code = contractErrorCode(tx.simulation.error);
    if (!force) return { outcome: 'rejected-simulation', hash: null, code, detail: tx.simulation.error };
    const { hash, status } = await this.#forceSubmit(to, amountStroops);
    if (status === 'SUCCESS') return { outcome: 'success', hash, code: null };
    // Report the error the ledger actually recorded, not the simulation's guess.
    return { outcome: 'failed-onchain', hash, code: (await this.#onchainErrorCode(hash)) ?? code };
  }

  async #onchainErrorCode(hash) {
    try {
      const meta = await run(STELLAR, ['tx', 'fetch', 'meta', '--hash', hash, '--network', this.conn.name, '--output', 'json']);
      const m = /"contract":\s*(\d+)/.exec(meta);
      return m ? Number(m[1]) : null;
    } catch {
      return null;
    }
  }

  /**
   * Builds the pay() transaction by hand, without simulation. The footprint
   * covers what pay() reads before any of its policy checks can reject
   * (instance, code, SpendLog); the resources are a fixed generous budget.
   */
  async #forceSubmit(to, amountStroops) {
    const { server, passphrase } = this.conn;
    const vault = new Address(this.vaultId);
    const wasm = await server.getContractWasmByContractId(this.vaultId);
    const dataKey = (key) => xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({
      contract: vault.toScAddress(), key, durability: xdr.ContractDataDurability.persistent,
    }));
    const footprint = new SorobanDataBuilder()
      .setReadOnly([
        dataKey(xdr.ScVal.scvLedgerKeyContractInstance()),
        xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({ hash: createHash('sha256').update(wasm).digest() })),
      ])
      .setReadWrite([dataKey(xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('SpendLog')]))])
      .setResources(3_000_000, 2_000, 2_000)
      .setResourceFee(300_000)
      .build();

    const args = [new Address(to).toScVal(), nativeToScVal(amountStroops, { type: 'i128' })];
    const auth = new xdr.SorobanAuthorizationEntry({
      credentials: xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),
      rootInvocation: new xdr.SorobanAuthorizedInvocation({
        function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
          new xdr.InvokeContractArgs({ contractAddress: vault.toScAddress(), functionName: 'pay', args }),
        ),
        subInvocations: [],
      }),
    });

    const source = await server.getAccount(this.address);
    const tx = new TransactionBuilder(source, { fee: '100', networkPassphrase: passphrase })
      .addOperation(Operation.invokeContractFunction({ contract: this.vaultId, function: 'pay', args, auth: [auth] }))
      .setSorobanData(footprint)
      .setTimeout(120)
      .build();

    const { signedTxXdr } = await this.#sign(tx.toXDR());
    const signed = TransactionBuilder.fromXDR(signedTxXdr, passphrase);
    const sent = await server.sendTransaction(signed);
    if (sent.status === 'ERROR') {
      throw new Error(`La red rechazó la tx sin ejecutarla: ${sent.errorResult?.result().switch().name ?? 'error'}`);
    }
    const final = await server.pollTransaction(sent.hash, { attempts: 30 });
    return { hash: sent.hash, status: final.status };
  }
}
