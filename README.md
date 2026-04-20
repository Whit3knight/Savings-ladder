# 🪜 SavingsLadder

**Save Together, Earn Together** — Group savings on Solana blockchain.

> Built for [Colosseum Frontier Hackathon](https://www.colosseum.org)

## Version Compatibility

| Component | Version | Notes |
|-----------|---------|-------|
| Anchor CLI | **0.30.1** | `avm install 0.30.1 && avm use 0.30.1` |
| anchor-lang | **0.30.1** | In `programs/savings_ladder/Cargo.toml` |
| anchor-spl | **0.30.1** | Must match anchor-lang version |
| Solana CLI | **1.18.17** | Recommended for Anchor 0.30.1 |
| Rust | **1.75+** | `rustup update stable` |
| @coral-xyz/anchor (TS) | **0.30.1** | In `savings-ladder-frontend/package.json` |
| @solana/web3.js | **1.95+** | |
| @solana/spl-token | **0.4.6** | |
| Next.js | **14.2** | |
| Node.js | **18+** | |

## Quick Start

### 1. Smart Contract

```bash
cd savings-ladder-program

# Build (first time will take a few minutes)
anchor build

# Sync program keys (IMPORTANT - fixes program ID mismatch)
anchor keys sync

# Rebuild with synced keys
anchor build

# Deploy to devnet
anchor deploy --provider.cluster devnet

# Note your Program ID from the output
```

### 2. Database (Supabase)

1. Go to https://supabase.com → create free project
2. Open **SQL Editor** → paste `savings-ladder-supabase/schema.sql` → Run
3. Go to **Settings → API** → copy URL and anon key

### 3. Frontend

```bash
cd savings-ladder-frontend

npm install --legacy-peer-deps

cp .env.local.example .env.local
# Edit .env.local with your Program ID + Supabase credentials

npm run dev
# Open http://localhost:3000
```

### 4. Test with Phantom Wallet

1. Install [Phantom](https://phantom.app/) browser extension
2. Switch to **Devnet**: Settings → Developer Settings → Change Network
3. Get test SOL: `solana airdrop 2`
4. Connect wallet on the app and try creating a group

## Project Structure

```
savings-ladder/
├── savings-ladder-program/          # Anchor/Rust smart contract
│   ├── Anchor.toml
│   ├── Cargo.toml                   # Workspace (has overflow-checks = true)
│   ├── programs/savings_ladder/
│   │   ├── Cargo.toml              # anchor-lang + anchor-spl 0.30.1 + idl-build
│   │   └── src/lib.rs              # Smart contract (~750 lines)
│   └── deploy.sh
├── savings-ladder-frontend/         # Next.js 14 + TypeScript
│   ├── app/
│   │   ├── page.tsx                # Landing page
│   │   ├── dashboard/page.tsx      # Dashboard
│   │   ├── create-group/page.tsx   # Create group form
│   │   ├── group/[id]/page.tsx     # Group detail
│   │   ├── providers/              # Wallet context
│   │   └── lib/                    # solana.ts, supabase.ts, idl.ts
│   └── package.json                # @coral-xyz/anchor 0.30.1
├── savings-ladder-supabase/
│   └── schema.sql                  # PostgreSQL + RLS + triggers
├── SETUP_GUIDE.md                  # Detailed setup instructions
└── README.md
```

## Smart Contract Instructions

| Instruction | Description |
|------------|-------------|
| `create_group` | Create savings group with vault PDA |
| `join_group` | Join as member |
| `deposit_monthly` | Deposit tokens to vault |
| `distribute_rewards` | Add staking interest (authority) |
| `claim_reward` | Claim proportional interest |
| `unlock_microloan` | Borrow up to 5× savings (≥3 deposits) |
| `repay_microloan` | Repay loan installment |
| `close_group` | Deactivate group (authority) |

## Troubleshooting

**`Program ID mismatch`** → Run `anchor keys sync` then `anchor build` again

**`idl-build feature missing`** → Already fixed in this repo's Cargo.toml

**`overflow-checks must be specified`** → Already fixed in workspace Cargo.toml

**`@coral-xyz/anchor version mismatch`** → Both Rust crate and npm package use 0.30.1

**`solana airdrop` fails** → Try https://faucet.solana.com or wait a few minutes

## License

MIT — Built for Colosseum Frontier Hackathon
