import { pool, Wallet, Transaction } from "../db";
import { TransferInput, TransferOutcome } from "../types";

export async function executeTransfer(
  input: TransferInput,
): Promise<TransferOutcome> {
  const { fromWalletId, toWalletId, amount, tenantId, idempotencyKey } = input;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const [firstId, secondId] =
      fromWalletId < toWalletId
        ? [fromWalletId, toWalletId]
        : [toWalletId, fromWalletId];
    let query =
      "SELECT * FROM wallets WHERE id = $1 AND tenant_id = $2 FOR UPDATE";
    let resp1 = await client.query<Wallet>(query, [firstId, tenantId]);
    let resp2 = await client.query<Wallet>(query, [secondId, tenantId]);
    if (firstId !== fromWalletId) {
      const temp = resp2;
      resp2 = resp1;
      resp1 = temp;
    }
    if (resp1.rowCount === 0) {
      await client.query("ROLLBACK");
      return { status: "NOT_FOUND", message: "Sender wallet not found" };
    }
    const sender = resp1.rows[0];
    if (!sender) {
      await client.query("ROLLBACK");
      return { status: "NOT_FOUND", message: "Sender wallet not found" };
    }
    const BigIntAmount = BigInt(amount);
    const BigIntBalance = BigInt(sender.balance);
    if (BigIntAmount > BigIntBalance) {
      await client.query("ROLLBACK");
      return { status: "INSUFFICIENT_FUNDS", message: "Insufficient funds" };
    }
    if (resp2.rowCount === 0) {
      await client.query("ROLLBACK");
      return { status: "NOT_FOUND", message: "Receiver wallet not found" };
    }
    query =
      "UPDATE wallets set balance = balance - $1 WHERE id = $2 AND tenant_id = $3 RETURNING balance";
    let balance = await client.query<{ balance: string }>(query, [
      amount,
      fromWalletId,
      tenantId,
    ]);
    const senderBalance = balance.rows[0].balance;
    if (!senderBalance) {
      await client.query("ROLLBACK");
      throw new Error("Failed to return created transaction");
    }
    query =
      "UPDATE wallets set balance = balance + $1 WHERE id = $2 AND tenant_id = $3 RETURNING balance";
    balance = await client.query<{ balance: string }>(query, [
      amount,
      toWalletId,
      tenantId,
    ]);
    const receiverBalance = balance.rows[0]?.balance;
    if (!receiverBalance) {
      await client.query("ROLLBACK");
      throw new Error("Failed to return created transaction");
    }
    const keyQuery =
      "INSERT INTO transactions (tenant_id, from_wallet_id, to_wallet_id, amount, idempotency_key) VALUES ($1, $2, $3, $4, $5) RETURNING *";

    const data = await client.query<Transaction>(keyQuery, [
      tenantId,
      fromWalletId,
      toWalletId,
      amount,
      idempotencyKey,
    ]);
    const currentId = data.rows[0]?.id;
    if (!currentId) {
      await client.query("ROLLBACK");
      throw new Error("Failed to return created transaction");
    }

    const ledgerQuery =
      "INSERT INTO ledger_entries (tenant_id, transaction_id, wallet_id, entry_type, amount, balance_after) VALUES ($1, $2, $3, $4, $5, $6)";
    await client.query(ledgerQuery, [
      tenantId,
      currentId,
      fromWalletId,
      "DEBIT",
      -amount,
      senderBalance,
    ]);
    await client.query(ledgerQuery, [
      tenantId,
      currentId,
      toWalletId,
      "CREDIT",
      amount,
      receiverBalance,
    ]);
    const createdTx = data.rows[0];
    if (!createdTx) {
      await client.query("ROLLBACK");
      throw new Error("Failed to return created transaction");
    }
    await client.query("COMMIT");
    return { status: "CREATED", transaction: createdTx };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (err) {}
    if ((err as { code?: string }).code === "23505") {
      const query =
        "SELECT * FROM transactions WHERE idempotency_key = $1 AND tenant_id = $2";
      const resp = await client.query<Transaction>(query, [
        idempotencyKey,
        tenantId,
      ]);
      const data = resp.rows[0];
      if (!data) {
        throw new Error("Internal Error");
      }
      if (
        data.from_wallet_id !== fromWalletId ||
        data.to_wallet_id !== toWalletId ||
        BigInt(data.amount) !== BigInt(amount)
      ) {
        return { status: "CONFLICT", message: "Invalid data" };
      }
      return { status: "REPLAYED", transaction: data };
    }
    console.error(err);
    return { status: "CONFLICT", message: "Internal Error" };
  } finally {
    client.release();
  }
}
