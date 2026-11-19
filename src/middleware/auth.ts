import {Request, Response, NextFunction} from "express";
import crypto from 'crypto';
import { pool } from "../db"; 

declare global {
  namespace Express {
    interface Request {
      tenantId?: string;
    }
  }
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const token = req.headers['authorization'];
  if (!token || typeof token !== 'string' || !token.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: "Missing x-tenant-id header"
    });
  }
  const rawToken = token.slice(7).trim();
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest("hex");
  const query = 'SELECT * FROM api_keys WHERE key_hash = $1';
  try {
    const resp = await pool.query<{ tenant_id: string }>(query, [tokenHash]);
    if (resp.rowCount === 0 || !resp.rows[0]) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }
    req.tenantId = resp.rows[0].tenant_id;
    next();
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      error: "Internal Error"
    });
  }
}
