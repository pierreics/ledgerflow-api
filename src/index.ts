import express, { Request, Response } from "express";
import { pool, Wallet, LedgerEntry } from "./db";
import { executeTransfer } from "./services/transferService";
import { authenticate } from "./middleware/auth";

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

app.get("/wallets", authenticate, async (req: Request, res: Response) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    return res.status(400).json({
      success: false,
      error: "Missing parameters",
    });
  }
  try {
    const query = "SELECT * FROM wallets WHERE tenant_id = $1";
    const resp = await pool.query<Wallet>(query, [tenantId]);
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

app.post("/transfers", authenticate, async (req: Request, res: Response) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    return res.status(400).json({
      success: false,
      error: "Missing parameters",
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
    typeof fromWalletId !== "string" ||
    !toWalletId ||
    typeof toWalletId !== "string" ||
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
  try {
    const outcome = await executeTransfer({
      tenantId,
      fromWalletId,
      toWalletId,
      amount,
      idempotencyKey,
    });
    switch (outcome.status) {
      case "CREATED":
        return res.status(201).json({
          success: true,
          message: "Transaction successfully executed",
          data: outcome.transaction,
        });

      case "REPLAYED":
        return res.status(200).json({
          success: true,
          message: "Transaction found",
          data: outcome.transaction,
        });

      case "NOT_FOUND":
        return res.status(404).json({
          success: false,
          error: outcome.message,
        });

      case "INSUFFICIENT_FUNDS":
        return res.status(400).json({
          success: false,
          error: outcome.message,
        });

      case "CONFLICT":
        return res.status(409).json({
          success: false,
          error: outcome.message,
        });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      error: "Internal Error",
    });
  }
});

app.get('/wallets/:id/ledger', authenticate, async (req: Request, res: Response) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    return res.status(401).json({
      success: false,
      error: 'Missing tenant id'
    });
  }
  const walletId = req.params.id; 
  if (!walletId || typeof walletId !== 'string') {
    return res.status(400).json({
      success: false,
      error : 'Invalid wallet Id'
    })
  }
  const walletQuery = 'SELECT * FROM wallets WHERE id = $1 AND tenant_id = $2';
  try {
    const walletResp = await pool.query<Wallet>(walletQuery, [walletId, tenantId]);
    if (walletResp.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: "Wallet not found "
      });
    }
    const ledgerQuery = 'SELECT * FROM ledger_entries WHERE wallet_id = $1 AND tenant_id = $2 ORDER BY created_at DESC';
    const ledgerResp = await pool.query<LedgerEntry>(ledgerQuery, [walletId, tenantId]);
    return res.status(200).json({
      success: true,
      data: ledgerResp.rows
    });
  } catch (err) {
    console.error(err);
    if ((err as { code?: string }).code === '22P02') {
      return res.status(400).json({
        success: false,
        error: 'Invalid wallet id format'
      });
    }
    return res.status(500).json({
      success: false,
      error: 'Internal Error'
    });
  }
});

app.listen(PORT, () => {
  console.log("Server avviato con successo");
});
