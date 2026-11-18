import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();
if (!process.env.DATABASE_URL) {
  throw new Error("Internal Error, DATABASE_URL missing");
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export interface Wallet {
  id: string;
  tenant_id: string;
  owner_name: string;
  balance: string;
  created_at: Date;
}

export interface Transaction {
  id: string;
  tenant_id: string;
  from_wallet_id: string;
  to_wallet_id: string;
  amount: string;
  idempotency_key: string;
  created_at: Date;
}