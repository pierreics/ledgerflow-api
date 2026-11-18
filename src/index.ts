import express, { Request, Response } from "express";
import { pool, Wallet, Transaction } from "./db";

const app = express();
const PORT: number = 3300;

app.use(express.json());

app.get("/health", async (req: Request, res: Response) => {
  try {
    const resp = await pool.query<{ now: Date }>("SELECT NOW()");
    return res.status(200).json({
      success: true,
      data: {
        result: resp.rows[0],
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      error: "Internal Error",
    });
  }
});

app.get("/wallets", async (req: Request, res: Response) => {
  const tenant = req.headers["x-tenant-id"];
  if (!tenant || typeof tenant !== "string") {
    return res.status(400).json({
      success: false,
      error: "Missing tenant-id header",
    });
  }
  try {
    const query = "SELECT * FROM wallets WHERE tenant_id = $1";
    const resp = await pool.query<Wallet>(query, [tenant]);
    return res.status(200).json({
      success: true,
      data: resp.rows,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      error: "Internal Error",
    });
  }
});

app.post("/transfers", async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"];
  if (!tenantId || typeof tenantId !== "string") {
    return res.status(400).json({
      success: false,
      error: "Missing x-tenant-id header",
    });
  }
  const idempotencyKey = req.headers["x-idempotency-key"];
  if (!idempotencyKey || typeof idempotencyKey !== "string") {
    return res.status(400).json({
      success: false,
      error: "Missing x-idempotency-key header",
    });
  }
  const { fromWalletId, toWalletId, amount } = req.body;
  if (
    !fromWalletId ||
    typeof fromWalletId !== 'string' ||
    !toWalletId ||
    typeof toWalletId !== 'string' ||
    !amount ||
    fromWalletId === toWalletId ||
    typeof amount !== "number" ||
    amount <= 0 ||
    !Number.isInteger(amount)
  ) {
    return res.status(400).json({
      success: false,
      error: "Invalid request",
    });
  }
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
      return res.status(404).json({
        success: false,
        error: "Sender's wallet not found",
      });
    }
    const sender = resp1.rows[0];
    const BigIntAmount = BigInt(amount);
    const BigIntBalance = BigInt(sender.balance);
    if (BigIntAmount > BigIntBalance) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        error: "Insufficient funds",
      });
    }
    if (resp2.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        error: "Receiver wallet not found ",
      });
    }
    query = "UPDATE wallets set balance = balance - $1 WHERE id = $2";
    await client.query(query, [amount, fromWalletId]);
    query = "UPDATE wallets set balance = balance + $1 WHERE id = $2";
    await client.query(query, [amount, toWalletId]);
    const keyQuery = 'INSERT INTO transactions (tenant_id, from_wallet_id, to_wallet_id, amount, idempotency_key) VALUES ($1, $2, $3, $4, $5) RETURNING *'

      const data = await client.query<Transaction>(keyQuery, [tenantId, fromWalletId, toWalletId, amount, idempotencyKey]);
      await client.query("COMMIT");
      return res.status(200).json({
        success: true,
        message: "Transaction successfully executed",
        data: data.rows[0]
      });
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch (err) { }
     if ((err as { code?: string }).code === '23505') {
      const query = 'SELECT * FROM transactions WHERE idempotency_key = $1 AND tenant_id = $2';
       const resp = await client.query<Transaction>(query, [idempotencyKey, tenantId]);
       const data = resp.rows[0];
       if (!data) {
         return res.status(500).json({
           success: false,
           error : 'Internal Error'
         })
       }
       if (
         data.from_wallet_id !== fromWalletId ||
         data.to_wallet_id !== toWalletId ||
         BigInt(data.amount) !== BigInt(amount)
       ) {
         return res.status(409).json({
           success: false,
           error: 'Invalid data'
         });
       }
      return res.status(200).json({
        success: true,
        message : 'Transaction found',
        data: data
      });
    }
      console.error(err);
      return res.status(500).json({
        success: false,
        error: "Internal error",
      });
    } finally {
      client.release();
    }
  });


app.listen(PORT, () => {
  console.log("Server avviato con successo");
});
