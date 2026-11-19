import { Transaction } from "./db"

export interface TransferInput {
  tenantId: string;
  fromWalletId: string;
  toWalletId: string;
  amount: number;
  idempotencyKey: string;
}

export type TransferOutcome =
  | { status: "CREATED", transaction: Transaction }
  | { status: "REPLAYED", transaction: Transaction }
  | { status: "CONFLICT", message: string }
  | { status: "NOT_FOUND", message: string }
  | { status: "INSUFFICIENT_FUNDS", message: string };

  
