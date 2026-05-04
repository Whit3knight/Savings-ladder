import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
  TransactionMessage,
  Keypair,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';
import { IDL } from './idl';

// ─── Constants ───────────────────────────────────────────────────
export const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID || '11111111111111111111111111111111'
);
export const SOLANA_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
export const NETWORK = process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet';

// Marinade Native Staking validator list account (read-only reference)
export const MARINADE_PROGRAM_ID = new PublicKey(
  'MarBmsSgKXdrN1egZf5sqe1TMai9K1rChYNDJgjq7aD'
);

// ─── Connection & Provider ────────────────────────────────────────
export function getConnection(): Connection {
  return new Connection(SOLANA_RPC_URL, 'confirmed');
}

/**
 * Wraps the raw Phantom wallet into an Anchor-compatible wallet.
 * Re-constructs PublicKey from our @solana/web3.js to avoid version mismatch.
 */
export function wrapPhantomWallet(phantomWallet: any) {
  if (!phantomWallet?.publicKey) {
    throw new Error('Wallet not connected. Please connect your Phantom wallet first.');
  }
  const pubkey = new PublicKey(phantomWallet.publicKey.toString());
  return {
    publicKey: pubkey,
    signTransaction: async (tx: Transaction | VersionedTransaction) =>
      phantomWallet.signTransaction(tx),
    signAllTransactions: async (txs: (Transaction | VersionedTransaction)[]) =>
      phantomWallet.signAllTransactions(txs),
  };
}

export function getProvider(wallet: any): AnchorProvider {
  const connection = getConnection();
  const wrappedWallet = wrapPhantomWallet(wallet);
  return new AnchorProvider(connection, wrappedWallet as any, {
    preflightCommitment: 'confirmed',
    commitment: 'confirmed',
    // skipPreflight prevents RPC from re-simulating a tx that was
    // already broadcast and confirmed (avoids AlreadyProcessed error).
    skipPreflight: true,
  });
}

export function getProgram(wallet: any): Program {
  const provider = getProvider(wallet);
  return new Program(IDL as any, provider);
}

/**
 * Returns true if the error is the "already processed" RPC error.
 * In that case we can safely treat the transaction as confirmed.
 */
function isAlreadyProcessed(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('already been processed') ||
    msg.includes('AlreadyProcessed') ||
    msg.includes('This transaction has already been processed')
  );
}

/**
 * Sends an Anchor RPC call and handles the "already processed" case by
 * extracting the signature from the error and returning it as success.
 */
async function sendRpc(rpcCall: () => Promise<string>): Promise<string> {
  try {
    return await rpcCall();
  } catch (err: any) {
    if (isAlreadyProcessed(err)) {
      // The tx was confirmed on-chain; extract the signature if available.
      const sig: string | undefined =
        err?.signature ?? err?.transactionSignature ?? err?.logs?.[0];
      if (sig && typeof sig === 'string') return sig;
      // Signature not extractable — the tx is confirmed, surface a clear message.
      throw new Error('Transaction was already confirmed on-chain. Refresh the page to see your group.');
    }
    throw err;
  }
}

// ─── PDA Helpers ─────────────────────────────────────────────────
export function getGroupPDA(authority: PublicKey, name: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('group'), authority.toBuffer(), Buffer.from(name)],
    PROGRAM_ID
  );
}

export function getMemberPDA(groupKey: PublicKey, memberAuthority: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('member'), groupKey.toBuffer(), memberAuthority.toBuffer()],
    PROGRAM_ID
  );
}

// ─── Smart Contract Calls ─────────────────────────────────────────

export interface CreateGroupInput {
  name: string;
  targetAmount: number;      // in lamports
  monthlyContribution: number; // in lamports
  durationMonths: number;
  maxMembers: number;
}

/** Create a group savings PDA */
export async function createGroup(wallet: any, input: CreateGroupInput): Promise<string> {
  const program = getProgram(wallet);
  const authority = program.provider.publicKey!;
  const [groupPDA] = getGroupPDA(authority, input.name);

  return sendRpc(() =>
    program.methods
      .createGroup(
        input.name,
        new BN(input.targetAmount),
        new BN(input.monthlyContribution),
        input.durationMonths,
        input.maxMembers
      )
      .accountsPartial({
        group: groupPDA,
        authority,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ maxRetries: 0 })
  );
}

/** Join a group — creates Member PDA */
export async function joinGroup(wallet: any, groupPubkey: PublicKey): Promise<string> {
  const program = getProgram(wallet);
  const authority = program.provider.publicKey!;
  const [memberPDA] = getMemberPDA(groupPubkey, authority);

  return sendRpc(() =>
    program.methods
      .joinGroup()
      .accountsPartial({
        group: groupPubkey,
        member: memberPDA,
        authority,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ maxRetries: 0 })
  );
}

/** Record deposit on-chain after Marinade Native staking has been done */
export async function recordDeposit(
  wallet: any,
  groupPubkey: PublicKey,
  amountLamports: number,
  stakeAccountPubkey: PublicKey
): Promise<string> {
  const program = getProgram(wallet);
  const authority = program.provider.publicKey!;
  const [memberPDA] = getMemberPDA(groupPubkey, authority);

  return sendRpc(() =>
    program.methods
      .recordDeposit(new BN(amountLamports), stakeAccountPubkey)
      .accountsPartial({
        group: groupPubkey,
        member: memberPDA,
        authority,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ maxRetries: 0 })
  );
}

/** Record withdrawal on-chain */
export async function recordWithdrawal(
  wallet: any,
  groupPubkey: PublicKey,
  amountLamports: number,
  stakeAccountPubkey: PublicKey
): Promise<string> {
  const program = getProgram(wallet);
  const authority = program.provider.publicKey!;
  const [memberPDA] = getMemberPDA(groupPubkey, authority);

  return sendRpc(() =>
    program.methods
      .recordWithdrawal(new BN(amountLamports), stakeAccountPubkey)
      .accountsPartial({
        group: groupPubkey,
        member: memberPDA,
        authority,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ maxRetries: 0 })
  );
}

// ─── Marinade Native Staking ──────────────────────────────────────

/**
 * Build + send a Marinade Native stake transaction.
 * Uses the @marinade.finance/native-staking-sdk to create a stake account
 * delegated to Marinade's auto-rebalancing validator set.
 *
 * Returns: { txSignature, stakeAccountPubkey }
 */
export async function marinadeStakeSOL(
  wallet: any,
  amountLamports: number
): Promise<{ txSignature: string; stakeAccountPubkey: PublicKey }> {
  // Dynamically import SDK to avoid SSR issues
  const { NativeStakingSDK, NativeStakingConfig } = await import(
    '@marinade.finance/native-staking-sdk'
  );

  const connection = getConnection();
  const wrappedWallet = wrapPhantomWallet(wallet);

  const config = new NativeStakingConfig({ connection });
  const sdk = new NativeStakingSDK(config);

  const { createAuthorizedStake: instructions, stakeKeypair } = await sdk.buildCreateAuthorizedStakeInstructions(
    wrappedWallet.publicKey,
    new BN(amountLamports)
  );

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

  const message = new TransactionMessage({
    payerKey: wrappedWallet.publicKey,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();

  const vt = new VersionedTransaction(message);

  // Stake keypair must sign first (creates the account)
  vt.sign([stakeKeypair]);

  // Then wallet signs
  const signed = await wallet.signTransaction(vt);

  const txSignature = await connection.sendRawTransaction(signed.serialize(), {
    skipPreflight: true,
    maxRetries: 3,
  });

  await connection.confirmTransaction(
    { signature: txSignature, blockhash, lastValidBlockHeight },
    'confirmed'
  );

  return { txSignature, stakeAccountPubkey: stakeKeypair.publicKey };
}

/**
 * Delayed unstake (Marinade Native): calls initPrepareForRevoke to begin the
 * ~1-epoch cooldown before SOL can be withdrawn.
 * Supports multiple accounts (though usually calls for the user authority).
 */
export async function marinadeDelayedUnstake(
  wallet: any,
  stakeAccountPubkeys: PublicKey | PublicKey[]
): Promise<string> {
  const { NativeStakingSDK, NativeStakingConfig } = await import(
    '@marinade.finance/native-staking-sdk'
  );

  const connection = getConnection();
  const wrappedWallet = wrapPhantomWallet(wallet);

  const config = new NativeStakingConfig({ connection });
  const sdk = new NativeStakingSDK(config);

  // initPrepareForRevoke returns instructions to pay fees and a callback
  const { payFees, onPaid } = await sdk.initPrepareForRevoke(wrappedWallet.publicKey);

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  const tx = new Transaction({ blockhash, feePayer: wrappedWallet.publicKey, lastValidBlockHeight });
  if (payFees && payFees.length > 0) tx.add(...payFees);

  const signed = await wallet.signTransaction(tx);
  const sig = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: true });
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');

  try { await onPaid(sig); } catch { /* best-effort */ }

  return sig;
}

/**
 * Instant unstake (Marinade Native): for accounts in readyToRevoke state,
 * withdraws SOL back to wallet immediately. Supports multiple accounts.
 */
export async function marinadeInstantUnstake(
  wallet: any,
  stakeAccountPubkeys: PublicKey | PublicKey[]
): Promise<string> {
  const { NativeStakingSDK, NativeStakingConfig } = await import(
    '@marinade.finance/native-staking-sdk'
  );

  const connection = getConnection();
  const wrappedWallet = wrapPhantomWallet(wallet);
  const accounts = Array.isArray(stakeAccountPubkeys) ? stakeAccountPubkeys : [stakeAccountPubkeys];

  const config = new NativeStakingConfig({ connection });
  const sdk = new NativeStakingSDK(config);

  const revokeIxs = sdk.buildRevokeInstructions(wrappedWallet.publicKey, accounts);

  if (!revokeIxs || revokeIxs.length === 0) {
    // Fallback to delayed if no revoke instructions available
    return marinadeDelayedUnstake(wallet, accounts);
  }

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  const tx = new Transaction({ blockhash, feePayer: wrappedWallet.publicKey, lastValidBlockHeight });
  tx.add(...revokeIxs);

  const signed = await wallet.signTransaction(tx);
  const sig = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: true });
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
  return sig;
}

/**
 * Get all stake accounts owned by the user (managed via Marinade Native).
 * Returns array of { pubkey, lamports, state } objects.
 */
export async function getUserStakeAccounts(walletPubkey: PublicKey): Promise<Array<{
  pubkey: PublicKey;
  lamports: number;
  state: 'staking' | 'preparingToRevoke' | 'readyToRevoke' | 'unknown';
  account: any;
}>> {
  try {
    const { NativeStakingSDK, NativeStakingConfig } = await import(
      '@marinade.finance/native-staking-sdk'
    );
    const connection = getConnection();
    const config = new NativeStakingConfig({ connection });
    const sdk = new NativeStakingSDK(config);
    const result = await sdk.getStakeAccounts(walletPubkey);

    if (!result) return [];

    // Normalise accounts from all buckets provided by the SDK
    const list: any[] = [];
    
    const process = (arr: any[], state: string) => {
      if (!Array.isArray(arr)) return;
      arr.forEach(item => {
        // Avoid duplicates if an account is in multiple buckets
        if (list.some(existing => existing.pubkey.toBase58() === item.pubkey.toBase58())) return;
        
        list.push({
          pubkey: item.pubkey,
          lamports: (item.account?.lamports ?? 0),
          state: state,
          account: item.account,
        });
      });
    };

    // Priority order for display
    process(result.readyToRevoke || [], 'readyToRevoke');
    process(result.preparingToRevoke || [], 'preparingToRevoke');
    process(result.staking || [], 'staking');
    process(result.all || [], 'unknown');

    return list;
  } catch (e) {
    console.error('getUserStakeAccounts error:', e);
    return [];
  }
}

/**
 * Fetch estimated staking rewards for a wallet address.
 * Returns rewards object or null on error.
 */
export async function fetchStakingRewards(walletPubkey: PublicKey): Promise<any | null> {
  try {
    const { NativeStakingSDK, NativeStakingConfig } = await import(
      '@marinade.finance/native-staking-sdk'
    );
    const connection = getConnection();
    const config = new NativeStakingConfig({ connection });
    const sdk = new NativeStakingSDK(config);
    const rewards = await sdk.fetchRewards(walletPubkey);
    return rewards ?? null;
  } catch {
    return null;
  }
}

// ─── Utilities ───────────────────────────────────────────────────

export function lamportsToSol(lamports: number): number {
  return lamports / LAMPORTS_PER_SOL;
}

export function solToLamports(sol: number): number {
  return Math.round(sol * LAMPORTS_PER_SOL);
}

export function formatSol(lamports: number, decimals = 4): string {
  return `${lamportsToSol(lamports).toFixed(decimals)} SOL`;
}

export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function shortenAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

/** Convert IDR display amount to lamports (using 1 SOL ≈ Rp 2,400,000 for display) */
export function idrToLamports(idr: number): number {
  const SOL_IDR_RATE = 2_400_000;
  const sol = idr / SOL_IDR_RATE;
  return solToLamports(sol);
}

export function lamportsToIdr(lamports: number): number {
  const SOL_IDR_RATE = 2_400_000;
  return lamportsToSol(lamports) * SOL_IDR_RATE;
}

export function getExplorerUrl(address: string, type: 'address' | 'tx' = 'address'): string {
  const cluster = NETWORK === 'mainnet-beta' ? '' : `?cluster=${NETWORK}`;
  return `https://explorer.solana.com/${type}/${address}${cluster}`;
}

/** Legacy compat */
export function displayToUsdc(amount: number): number {
  return Math.round(amount * 1e6);
}
