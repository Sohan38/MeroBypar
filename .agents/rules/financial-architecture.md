---
trigger: model_decision
description: Financial posting architecture, idempotent ledger entries, system accounts, daybook movements, and reconciliation.
globs:
  - "src/services/financialPostingService.ts"
  - "src/lib/financialMetrics.ts"
  - "src/pages/cashbook/**"
  - "src/pages/reports/**"
---

# Financial Ledger Architecture Guidelines

This rule outlines the financial recording model, double-entry-inspired movements, and idempotency guarantees in MeroByapar.

---

## 1. Core Principles

1. **Centralized Service**: All financial ledger postings MUST execute through `src/services/financialPostingService.ts` (`postFinancialTransaction`).
2. **Decoupled from Operational Truth**:
   - Primary operational records (`sales`, `purchases`, `expenses`, `hotelBills`) remain the definitive business truth for operations, invoices, and customer receipts.
   - The financial ledger (`financialTransactions` and `financialMovements`) provides an accounting view, audit trail, daybook, and reconciliation layer.
3. **Strict Idempotency**:
   - Every posting MUST include an `idempotencyKey` constructed from `sourceType` and `sourceId` (e.g., `sale-${sale.id}`, `purchase-${purchase.id}`).
   - Before writing, `financialPostingService` checks if a transaction with that `idempotencyKey` already exists.
   - If found, it skips duplicate insertion or updates existing records to prevent double-counting under network retries or component re-renders.

---

## 2. System Accounts Hierarchy

MeroByapar initializes default system accounts (`DEFAULT_ACCOUNTS`):

| Account ID | Name | Type | Linked Payment Method |
| :--- | :--- | :--- | :--- |
| `financial-account-cash` | Main Cash Drawer | `cash` | `cash` |
| `financial-account-bank` | Primary Bank A/C (Fonepay QR) | `bank` | `bank`, `qr` |
| `financial-account-digital` | Digital Wallet (eSewa/Khalti) | `digital` | `other` |
| `financial-account-card` | Card Clearing | `card` | `card` |
| `financial-account-receivables` | Customer Receivables | `receivable` | Customer credit / khata |
| `financial-account-payables` | Supplier Payables | `payable` | Supplier credit / balance |
| `financial-account-other` | Other Clearing | `clearing` | Unmapped clearing |

---

## 3. Transaction Posting Model

When posting a financial transaction:

```typescript
export type PostFinancialTransactionInput = {
    date: string;                  // ISO 8601 string
    type: FinancialTransactionType;// 'sale' | 'purchase' | 'expense' | 'payment_in' | 'payment_out' | 'transfer'
    description: string;
    sourceType: string;            // 'sale' | 'purchase' | 'expense' | etc.
    sourceId: string;              // Primary record ID
    idempotencyKey: string;        // `${sourceType}-${sourceId}` or unique operation key
    movements: FinancialMovementInput[];
    reference?: string | null;
    userId?: string | null;
    locationId?: string | null;    // Location attributing the movement
};
```

### Movement Rules
- Debits and credits are represented via directional movements linked to accounts.
- Split payments (e.g. part cash, part QR) generate multiple movements within the same single transaction.
- Location attribution (`locationId`) must be passed whenever the underlying transaction occurs at a specific branch or POS station.

---

## 4. Reporting & Metrics Integration

- Reports and cashbook summaries query `financialMovements` filtered by `dateRange`, `accountId`, and `locationId`.
- Never mutate movements directly in reporting or cashbook components; queries are read-only.
