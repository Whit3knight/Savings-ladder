# 🪜 SavingsLadder — Setup Guide (Step-by-Step)

## Masalah: File dari Claude itu flat / terpisah

Ketika kamu download file dari Claude, semua file keluar terpisah-pisah.
Padahal Anchor butuh **struktur folder yang sangat spesifik** agar bisa build.

Jadi kamu punya **2 pilihan**:

---

## ✅ PILIHAN 1: Init dari Anchor (DIREKOMENDASIKAN)

Ini cara paling aman karena Anchor generate boilerplate yang pasti benar.

### Step 1: Pastikan tools sudah terinstall

```bash
# Cek semua tools
solana --version     # harus >= 1.17.0
anchor --version     # harus >= 0.29.0
rustc --version      # harus >= 1.70.0
node --version       # harus >= 18.0.0
```

Kalau belum install, lihat bagian "Install Prerequisites" di bawah.

### Step 2: Buat project Anchor

```bash
# Buat folder utama
mkdir savings-ladder
cd savings-ladder

# Init Anchor project
anchor init savings-ladder-program
cd savings-ladder-program
```

Setelah `anchor init`, Anchor akan generate struktur seperti ini:
```
savings-ladder-program/
├── Anchor.toml           ← auto-generated
├── Cargo.toml            ← auto-generated (workspace)
├── programs/
│   └── savings_ladder_program/
│       ├── Cargo.toml    ← auto-generated (program)
│       └── src/
│           └── lib.rs    ← auto-generated (GANTI dengan code kita)
├── tests/
├── app/
└── migrations/
```

### Step 3: Replace lib.rs dengan smart contract kita

```bash
# Buka file ini dengan editor:
# programs/savings_ladder_program/src/lib.rs

# HAPUS semua isinya, lalu PASTE seluruh isi dari file lib.rs yang saya buat
# (file "lib.rs" dari download Claude — 751 baris)
```

Atau kalau pakai terminal:
```bash
# Kalau file lib.rs dari Claude ada di ~/Downloads/lib.rs:
cp ~/Downloads/lib.rs programs/savings_ladder_program/src/lib.rs
```

### Step 4: Update Cargo.toml program (tambah anchor-spl)

Buka file `programs/savings_ladder_program/Cargo.toml` dan pastikan dependencies-nya:

```toml
[dependencies]
anchor-lang = "0.29.0"
anchor-spl = "0.29.0"
```

Kemungkinan dari `anchor init` hanya ada `anchor-lang`. Kamu perlu **tambahkan** `anchor-spl = "0.29.0"` karena smart contract kita pakai SPL Token transfer.

### Step 5: Build!

```bash
# Pastikan kamu di folder savings-ladder-program/
anchor build
```

Kalau berhasil, outputnya akan ada di:
```
target/deploy/savings_ladder_program-keypair.json  ← keypair
target/deploy/savings_ladder_program.so            ← program binary
target/idl/savings_ladder_program.json             ← IDL
```

### Step 6: Dapatkan Program ID

```bash
solana-keygen pubkey target/deploy/savings_ladder_program-keypair.json
# Output: sesuatu seperti "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
```

### Step 7: Update Program ID di lib.rs

Buka `programs/savings_ladder_program/src/lib.rs`, cari baris:
```rust
declare_id!("SAVELadder1111111111111111111111111111111111");
```

Ganti dengan Program ID yang kamu dapat dari Step 6:
```rust
declare_id!("7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU");  // contoh
```

Juga update di `Anchor.toml`:
```toml
[programs.devnet]
savings_ladder_program = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
```

### Step 8: Build ulang & Deploy

```bash
# Build ulang dengan Program ID yang benar
anchor build

# Deploy ke devnet
anchor deploy --provider.cluster devnet
```

### Step 9: Test

```bash
anchor test
```

---

## 📌 PILIHAN 2: Susun manual dari file Claude

Kalau kamu mau pakai semua file yang saya buat tanpa `anchor init`:

```bash
# 1. Buat struktur folder
mkdir -p savings-ladder/savings-ladder-program/programs/savings_ladder/src
mkdir -p savings-ladder/savings-ladder-program/tests

# 2. Pindahkan file ke tempat yang benar:
#
#    File dari Claude                    → Taruh di
#    ──────────────────────────────────────────────────────
#    Anchor.toml                         → savings-ladder-program/Anchor.toml
#    Cargo.toml (yang isinya [workspace])→ savings-ladder-program/Cargo.toml
#    Cargo.toml (yang isinya [package])  → savings-ladder-program/programs/savings_ladder/Cargo.toml
#    lib.rs                              → savings-ladder-program/programs/savings_ladder/src/lib.rs
#    integration.rs                      → savings-ladder-program/tests/integration.rs
#    deploy.sh                           → savings-ladder-program/deploy.sh

# 3. Build
cd savings-ladder/savings-ladder-program
anchor build
```

**PENTING:** Ada 2 file bernama `Cargo.toml` — jangan tertukar!
- Yang isinya `[workspace]` → taruh di ROOT (`savings-ladder-program/Cargo.toml`)
- Yang isinya `[package]` + `[dependencies]` → taruh di PROGRAM (`programs/savings_ladder/Cargo.toml`)

---

## 🌐 Setup Frontend (Setelah Smart Contract jadi)

```bash
# 1. Pindah ke root project
cd savings-ladder

# 2. Buat folder frontend
mkdir savings-ladder-frontend
cd savings-ladder-frontend

# 3. Init Next.js project (cara termudah)
npx create-next-app@14 . --typescript --tailwind --app --src-dir=false

# 4. Install Solana dependencies
npm install --legacy-peer-deps \
  @coral-xyz/anchor \
  @solana/web3.js \
  @solana/spl-token \
  @supabase/supabase-js \
  bn.js bs58 react-hot-toast

# 5. Replace/tambahkan file dari Claude:
#    - app/page.tsx          ← Landing page
#    - app/layout.tsx        ← Root layout
#    - app/globals.css       ← Design system
#    - app/dashboard/page.tsx
#    - app/create-group/page.tsx
#    - app/group/[id]/page.tsx
#    - app/providers/WalletProvider.tsx
#    - app/lib/solana.ts
#    - app/lib/supabase.ts
#    - app/lib/idl.ts

# 6. Setup environment
cp .env.local.example .env.local
# Edit .env.local — masukkan Program ID dan Supabase credentials

# 7. Run
npm run dev
# Buka http://localhost:3000
```

---

## 🗄️ Setup Database (Supabase)

```bash
# 1. Buka https://supabase.com → Sign up (gratis)
# 2. Klik "New Project" → buat project
# 3. Buka SQL Editor
# 4. Paste seluruh isi file schema.sql
# 5. Klik "Run"
# 6. Buka Settings → API → copy URL dan anon key
# 7. Masukkan ke .env.local frontend
```

---

## 📋 Urutan Lengkap (Ringkasan)

```
1. Install tools (Rust, Solana CLI, Anchor CLI, Node.js)
2. anchor init savings-ladder-program
3. Replace lib.rs dengan smart contract code
4. Tambah anchor-spl di Cargo.toml
5. anchor build
6. Catat Program ID
7. Update declare_id! dan Anchor.toml
8. anchor build (ulang)
9. anchor deploy --provider.cluster devnet
10. Setup Supabase (buat project, jalankan schema.sql)
11. Setup frontend (create-next-app, install deps, masukkan file)
12. Edit .env.local (Program ID + Supabase URL + Supabase Key)
13. npm run dev
14. Test dengan Phantom wallet (switch ke devnet)
15. Push ke GitHub untuk submission
```

---

## ⚠️ Install Prerequisites (Kalau belum ada)

```bash
# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env

# Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/v1.17.31/install)"
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

# Setup Solana wallet
solana config set --url devnet
solana-keygen new       # Simpan seed phrase!
solana airdrop 2        # Dapat test SOL

# Anchor CLI
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install latest
avm use latest

# Node.js (via nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 18
nvm use 18
```

---

## ❓ Troubleshooting

**Q: `anchor build` error "package not found"**
A: Pastikan `Cargo.toml` yang ada `[workspace]` berada di root, bukan di dalam `programs/`.

**Q: `anchor build` error "anchor-spl not found"**
A: Tambahkan `anchor-spl = "0.29.0"` di `programs/savings_ladder/Cargo.toml` bagian `[dependencies]`.

**Q: `declare_id!` mismatch**
A: Jalankan `solana-keygen pubkey target/deploy/xxx-keypair.json` lalu update di `lib.rs` dan `Anchor.toml`.

**Q: `solana airdrop` gagal**
A: Devnet faucet kadang penuh. Coba lagi beberapa menit kemudian, atau pakai https://faucet.solana.com

**Q: Frontend error "wallet not found"**
A: Install Phantom browser extension dan switch ke Devnet di Settings → Developer Settings.
