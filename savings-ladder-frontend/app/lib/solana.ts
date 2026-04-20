import { Connection, PublicKey, SystemProgram, Transaction, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import { Program, AnchorProvider, BN, Idl } from '@coral-xyz/anchor';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token';
import { IDL } from './idl';

// Fallback to SystemProgram ID (all 1s) — a valid placeholder until real Program ID is set in .env.local
export const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID || '11111111111111111111111111111111'
);
export const SOLANA_RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
export const NETWORK = process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet';

export const USDC_MINT: Record<string, PublicKey> = {
  'mainnet-beta': new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
  devnet: new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'),
};

export function getConnection(): Connection {
  return new Connection(SOLANA_RPC_URL, 'confirmed');
}

/**
 * Wraps the raw Phantom wallet provider into an Anchor-compatible wallet.
 * This fixes the "_bn" error by ensuring publicKey is a proper @solana/web3.js PublicKey
 * from *our* version of the library, not Phantom's bundled version.
 */
export function wrapPhantomWallet(phantomWallet: any) {
  if (!phantomWallet?.publicKey) {
    throw new Error('Wallet not connected. Please connect your Phantom wallet first.');
  }
  // Re-construct the PublicKey from our @solana/web3.js to avoid version mismatch
  const pubkey = new PublicKey(phantomWallet.publicKey.toString());
  return {
    publicKey: pubkey,
    signTransaction: async (tx: Transaction): Promise<Transaction> => {
      return phantomWallet.signTransaction(tx);
    },
    signAllTransactions: async (txs: Transaction[]): Promise<Transaction[]> => {
      return phantomWallet.signAllTransactions(txs);
    },
  };
}

export function getProvider(wallet: any): AnchorProvider {
  const connection = getConnection();
  const wrappedWallet = wrapPhantomWallet(wallet);
  return new AnchorProvider(connection, wrappedWallet as any, { preflightCommitment: 'confirmed', commitment: 'confirmed' });
}

export function getProgram(wallet: any): Program {
  const provider = getProvider(wallet);
  const idlWithAddress = { ...IDL, address: PROGRAM_ID.toBase58() };
  return new Program(idlWithAddress as Idl, provider);
}

export async function getGroupPDA(authority: PublicKey, name: string): Promise<[PublicKey, number]> {
  return PublicKey.findProgramAddressSync([Buffer.from('group'), authority.toBuffer(), Buffer.from(name)], PROGRAM_ID);
}

export async function getVaultPDA(groupKey: PublicKey): Promise<[PublicKey, number]> {
  return PublicKey.findProgramAddressSync([Buffer.from('vault'), groupKey.toBuffer()], PROGRAM_ID);
}

export async function getMemberPDA(groupKey: PublicKey, memberAuthority: PublicKey): Promise<[PublicKey, number]> {
  return PublicKey.findProgramAddressSync([Buffer.from('member'), groupKey.toBuffer(), memberAuthority.toBuffer()], PROGRAM_ID);
}

export async function getLoanPDA(memberKey: PublicKey, groupKey: PublicKey): Promise<[PublicKey, number]> {
  return PublicKey.findProgramAddressSync([Buffer.from('loan'), memberKey.toBuffer(), groupKey.toBuffer()], PROGRAM_ID);
}

export interface CreateGroupInput {
  name: string; targetAmount: number; monthlyContribution: number;
  durationMonths: number; maxMembers: number;
}

export async function createGroup(wallet: any, input: CreateGroupInput): Promise<string> {
  const program = getProgram(wallet);
  // Use the wrapped publicKey from our provider (already a proper PublicKey)
  const authority = program.provider.publicKey!;
  const mint = USDC_MINT[NETWORK] || USDC_MINT.devnet;
  const [groupPDA] = await getGroupPDA(authority, input.name);
  const [vaultPDA] = await getVaultPDA(groupPDA);

  const tx = await program.methods
    .createGroup(input.name, new BN(input.targetAmount), new BN(input.monthlyContribution), input.durationMonths, input.maxMembers)
    .accountsPartial({
      group: groupPDA, vault: vaultPDA, mint, authority,
      systemProgram: SystemProgram.programId, tokenProgram: TOKEN_PROGRAM_ID,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .rpc();
  return tx;
}

export async function joinGroup(wallet: any, groupPubkey: PublicKey): Promise<string> {
  const program = getProgram(wallet);
  const authority = program.provider.publicKey!;
  const [memberPDA] = await getMemberPDA(groupPubkey, authority);

  const tx = await program.methods.joinGroup()
    .accountsPartial({ group: groupPubkey, member: memberPDA, authority, systemProgram: SystemProgram.programId })
    .rpc();
  return tx;
}

export async function depositMonthly(wallet: any, groupPubkey: PublicKey, amount: number): Promise<string> {
  const program = getProgram(wallet);
  const authority = program.provider.publicKey!;
  const mint = USDC_MINT[NETWORK] || USDC_MINT.devnet;
  const [memberPDA] = await getMemberPDA(groupPubkey, authority);
  const [vaultPDA] = await getVaultPDA(groupPubkey);
  const userTokenAccount = await getAssociatedTokenAddress(mint, authority);

  const tx = await program.methods.depositMonthly(new BN(amount))
    .accountsPartial({ group: groupPubkey, member: memberPDA, vault: vaultPDA, userTokenAccount, authority, tokenProgram: TOKEN_PROGRAM_ID })
    .rpc();
  return tx;
}

export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
}

export function shortenAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

export function displayToUsdc(amount: number): number {
  return Math.round(amount * 1e6);
}

export function getExplorerUrl(address: string, type: 'address' | 'tx' = 'address'): string {
  const cluster = NETWORK === 'mainnet-beta' ? '' : `?cluster=${NETWORK}`;
  return `https://explorer.solana.com/${type}/${address}${cluster}`;
}
