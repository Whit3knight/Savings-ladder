'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useWallet } from '../../providers/WalletProvider';
import {
  formatSol, formatRupiah, shortenAddress, getExplorerUrl,
  lamportsToSol, solToLamports, marinadeStakeSOL, marinadeDelayedUnstake, marinadeInstantUnstake,
  getUserStakeAccounts, fetchStakingRewards, recordDeposit, recordWithdrawal, joinGroup,
} from '../../lib/solana';
import {
  getGroupDetails, getGroupDeposits, getGroupWithdrawals, getLeaderboard,
  getOrCreateUser, saveDeposit, saveWithdrawal, updateGroupStaked, updateMemberStats, saveMember,
} from '../../lib/supabase';
import { PublicKey, LAMPORTS_PER_SOL as WEB3_LAMPORTS } from '@solana/web3.js';

type Tab = 'overview' | 'members' | 'history';

export default function GroupPortfolioPage() {
  const params = useParams();
  const groupId = params.id as string;
  const { isConnected, walletAddress } = useWallet();

  const [group, setGroup] = useState<any>(null);
  const [deposits, setDeposits] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const [stakeAccounts, setStakeAccounts] = useState<any[]>([]);
  const [rewards, setRewards] = useState<number | null>(null);
  const [totalStakedLamports, setTotalStakedLamports] = useState(0);

  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [depositSol, setDepositSol] = useState('');
  const [withdrawType, setWithdrawType] = useState<'delayed' | 'instant'>('delayed');
  const [selectedStakeAccount, setSelectedStakeAccount] = useState('');
  const [withdrawAll, setWithdrawAll] = useState(false);
  const [txLoading, setTxLoading] = useState(false);
  const [txMsg, setTxMsg] = useState('');

  const load = useCallback(async () => {
    if (!groupId) return;
    setLoading(true);
    try {
      // Fetch group details — catch individually so a missing group shows
      // "Group Not Found" rather than a blank screen.
      let g: any = null;
      try { g = await getGroupDetails(groupId); } catch { g = null; }

      const [d, w, l] = await Promise.allSettled([
        getGroupDeposits(groupId),
        getGroupWithdrawals(groupId),
        getLeaderboard(groupId),
      ]);
      setGroup(g);
      setDeposits(d.status === 'fulfilled' ? d.value || [] : []);
      setWithdrawals(w.status === 'fulfilled' ? w.value || [] : []);
      setLeaderboard(l.status === 'fulfilled' ? l.value || [] : []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [groupId]);

  const loadOnchain = useCallback(async () => {
    if (!walletAddress) return;
    try {
      const pk = new PublicKey(walletAddress);
      const [accsRaw, rwds] = await Promise.all([getUserStakeAccounts(pk), fetchStakingRewards(pk)]);
      // getUserStakeAccounts may return null/undefined on SDK error — guard defensively
      const accs: any[] = Array.isArray(accsRaw) ? accsRaw : [];
      setStakeAccounts(accs);
      setRewards(rwds);
      const total = accs.reduce((s: number, a: any) => s + (a.lamports ?? 0), 0);
      setTotalStakedLamports(total);
    } catch (e) {
      console.warn('loadOnchain error (non-fatal):', e);
      setStakeAccounts([]);
      setRewards(null);
    }
  }, [walletAddress]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadOnchain(); }, [loadOnchain]);

  // Auto-select the first available stake account when opening the withdraw modal
  useEffect(() => {
    if (showWithdrawModal && stakeAccounts.length > 0 && !selectedStakeAccount) {
      setSelectedStakeAccount(stakeAccounts[0].pubkey?.toBase58() || '');
    }
  }, [showWithdrawModal, stakeAccounts, selectedStakeAccount]);

  // Find this user's membership record. The FK join may not return nested user data
  // if the FK name doesn't match — so we also fall back to member_pubkey comparison.
  // Creator is always treated as a member so they can see Deposit/Withdraw buttons.
  const isCreator = group?.creator?.wallet_address === walletAddress;
  const myMembership = group?.members?.find(
    (m: any) =>
      m.user?.wallet_address === walletAddress ||
      m.member_pubkey === walletAddress
  ) ?? (isCreator && group?.members?.length > 0 ? group.members[0] : null)
    ?? (isCreator ? { id: null, total_deposited: 0, deposit_count: 0, streak_count: 0, joined_at: group?.created_at } : null);
  const myTotalDeposited = myMembership?.total_deposited || 0;
  // Calculate estimated annual rewards at 7.5% APY from user's staked amount.
  // The Marinade SDK fetchRewards only returns real data after epoch completion (~2-3 days).
  // We show a calculated estimate so the user always sees a meaningful number.
  const APY = 0.075;
  const estimatedAnnualRewardsLamports = Math.round(myTotalDeposited * APY);
  const estimatedMonthlyRewardsLamports = Math.round(estimatedAnnualRewardsLamports / 12);
  const progress = group?.target_amount > 0 ? Math.min(100, Math.round((group.total_staked / group.target_amount) * 100)) : 0;

  async function handleDeposit() {
    if (!walletAddress || !group || !depositSol) return;
    setTxLoading(true); setTxMsg('Initializing membership…');
    try {
      const wallet = (window as any).solana;
      const groupPubkey = new PublicKey(group.group_pubkey);

      // Step 1 — Ensure Member PDA exists on-chain.
      // joinGroup is idempotent: if already joined the tx will be rejected on-chain
      // with a constraint error; we swallow that and continue.
      try {
        setTxMsg('Joining group on-chain (first time only)…');
        await joinGroup(wallet, groupPubkey);
        // Also upsert the Supabase member row for this wallet
        const user = await getOrCreateUser(walletAddress);
        await saveMember({ group_id: groupId, user_id: user.id, member_pubkey: walletAddress })
          .catch(() => {}); // ignore duplicate errors
      } catch (joinErr: any) {
        // Anchor throws if account already exists — that's fine, proceed
        const msg = joinErr?.message ?? '';
        const alreadyJoined =
          msg.includes('already in use') ||
          msg.includes('already been processed') ||
          msg.includes('AlreadyInitialized') ||
          msg.includes('custom program error: 0x0') ||
          msg.includes('Transaction was already confirmed on-chain');
        if (!alreadyJoined) throw joinErr; // real error — bubble up
      }

      // Step 2 — Stake with Marinade Native
      const lamports = solToLamports(parseFloat(depositSol));
      setTxMsg('Staking SOL via Marinade Native…');
      const { txSignature, stakeAccountPubkey } = await marinadeStakeSOL(wallet, lamports);

      // Step 3 — Save to Supabase (Marinade txSignature is the on-chain proof for each deposit)

      // Step 4 — Save to Supabase
      setTxMsg('Saving to database…');
      const user = await getOrCreateUser(walletAddress);
      // Resolve member_id from DB (may have just been created above)
      const memberRow = myMembership?.id
        ? { id: myMembership.id }
        : await saveMember({ group_id: groupId, user_id: user.id, member_pubkey: walletAddress }).catch(() => null);
      await saveDeposit({
        group_id: groupId, member_id: memberRow?.id ?? myMembership?.id,
        amount_lamports: lamports, stake_account_pubkey: stakeAccountPubkey.toBase58(),
        tx_hash: txSignature,
      });

      // Step 5 — Update Stats
      const newTotalDeposited = (myMembership?.total_deposited || 0) + lamports;
      const newDepositCount = (myMembership?.deposit_count || 0) + 1;
      const newGroupStaked = (group.total_staked || 0) + lamports;
      await updateMemberStats(memberRow?.id ?? myMembership?.id, newTotalDeposited, newDepositCount, myMembership?.streak_count);
      await updateGroupStaked(groupId, newGroupStaked);

      setTxMsg('✅ Deposit confirmed!');
      await Promise.all([load(), loadOnchain()]);
      setTimeout(() => { setShowDepositModal(false); setDepositSol(''); setTxMsg(''); }, 1500);
    } catch (e: any) { setTxMsg(`❌ ${e.message || 'Deposit failed'}`); }
    finally { setTxLoading(false); }
  }

  async function handleWithdraw() {
    if (!walletAddress || !group || (!selectedStakeAccount && !withdrawAll)) return;
    setTxLoading(true); setTxMsg('Preparing withdrawal…');
    try {
      const wallet = (window as any).solana;
      
      // Determine which accounts to withdraw
      const accountsToWithdraw = withdrawAll 
        ? stakeAccounts.filter(a => a.lamports > 0)
        : stakeAccounts.filter(a => a.pubkey?.toBase58() === selectedStakeAccount);

      if (accountsToWithdraw.length === 0) throw new Error('No stake accounts with balance found.');

      const totalLamports = accountsToWithdraw.reduce((sum, a) => sum + (a.lamports || 0), 0);
      const accountPubkeys = accountsToWithdraw.map(a => a.pubkey);

      setTxMsg(withdrawType === 'delayed' ? `Deactivating ${accountsToWithdraw.length} account(s)…` : `Processing instant unstake for ${accountsToWithdraw.length} account(s)…`);

      // Step 1 — Perform Marinade Unstake (Batch)
      let txSig: string;
      if (withdrawType === 'instant') {
        txSig = await marinadeInstantUnstake(wallet, accountPubkeys);
      } else {
        txSig = await marinadeDelayedUnstake(wallet, accountPubkeys);
      }

      // Step 2 — Record withdrawal on-chain (One record per account or total)
      // For simplicity and clarity in history, we record the total withdrawn in this batch
      setTxMsg('Recording withdrawal on-chain…');
      try {
        await recordWithdrawal(wallet, new PublicKey(group.group_pubkey), totalLamports, accountPubkeys[0]);
      } catch (onChainErr: any) {
        console.warn('On-chain record failed:', onChainErr);
      }

      // Step 3 — Save to Supabase
      setTxMsg('Saving to database…');
      await saveWithdrawal({
        group_id: groupId,
        member_id: myMembership?.id,
        amount_lamports: totalLamports,
        tx_hash: txSig,
        withdraw_type: withdrawType,
        stake_account_pubkey: withdrawAll ? 'MULTIPLE_ACCOUNTS' : selectedStakeAccount,
      });

      // Step 4 — Update Local Stats
      const newTotalDeposited = Math.max(0, (myMembership?.total_deposited || 0) - totalLamports);
      const newGroupStaked = Math.max(0, (group.total_staked || 0) - totalLamports);

      await updateMemberStats(myMembership?.id, newTotalDeposited, myMembership?.deposit_count, myMembership?.streak_count);
      await updateGroupStaked(groupId, newGroupStaked);

      setTxMsg('✅ Withdrawal successful!');
      await Promise.all([load(), loadOnchain()]);
      setTimeout(() => {
        setShowWithdrawModal(false);
        setSelectedStakeAccount('');
        setWithdrawAll(false);
        setTxMsg('');
      }, 2000);
    } catch (e: any) {
      console.error('Withdrawal error:', e);
      setTxMsg(`❌ ${e.message || 'Withdrawal failed'}`);
    } finally {
      setTxLoading(false);
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center">
      <div className="animate-spin w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full" />
    </div>
  );

  if (!group) return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center">
      <div className="text-center"><div className="text-5xl mb-4">🔍</div>
        <h1 className="text-xl font-bold mb-4">Group Not Found</h1>
        <Link href="/dashboard" className="btn-primary">Back to Dashboard</Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      {/* Header */}
      <header className="glass sticky top-0 z-50 border-b border-slate-200 dark:border-slate-700/50">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2 text-slate-600 hover:text-emerald-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Dashboard
          </Link>
          <span className="marinade-badge">🌊 Marinade Native Staking</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Group Header */}
        <div className="card-elevated animate-slide-up">
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <div className="text-6xl">{group.emoji || '🪜'}</div>
            <div className="flex-1">
              <h1 className="font-display text-2xl md:text-3xl font-bold text-slate-900 dark:text-slate-50">{group.name}</h1>
              <div className="flex flex-wrap gap-3 mt-2 text-sm text-slate-500">
                <span>🎯 Target: <strong>{formatSol(group.target_amount)}</strong></span>
                <span>👥 {group.total_members}/{group.max_members} members</span>
                <span className={group.status === 'active' ? 'text-emerald-600 font-medium' : ''}>
                  {group.status === 'active' ? '🟢 Active' : group.status}
                </span>
              </div>
            </div>
            {isConnected && myMembership && (
              <div className="flex gap-3">
                <button id="deposit-sol-btn" onClick={() => setShowDepositModal(true)} className="btn-primary flex items-center gap-2">
                  ⬆️ Deposit SOL
                </button>
                <button id="withdraw-sol-btn" onClick={() => setShowWithdrawModal(true)} className="btn-outline flex items-center gap-2">
                  ⬇️ Withdraw
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Portfolio Hero Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-fade-scale">
          <div className="card-elevated md:col-span-1 bg-gradient-to-br from-emerald-600 to-emerald-700 border-0 text-white">
            <div className="text-sm font-medium text-emerald-100 mb-1">Your Staked SOL</div>
            <div className="text-3xl font-bold mb-1">{lamportsToSol(myTotalDeposited).toFixed(3)} SOL</div>
            <div className="text-sm text-emerald-200">{group.monthly_contribution ? `${lamportsToSol(group.monthly_contribution).toFixed(2)} SOL/month` : ''}</div>
          </div>
          <div className="card-elevated">
            <div className="text-sm font-medium text-slate-500 mb-1">Est. Annual Rewards</div>
            <div className="text-3xl font-bold text-amber-600 mb-1">
              {myTotalDeposited > 0
                ? `+${lamportsToSol(estimatedAnnualRewardsLamports).toFixed(4)} SOL/yr`
                : '—'}
            </div>
            <div className="text-xs text-slate-400">
              {myTotalDeposited > 0
                ? `~${lamportsToSol(estimatedMonthlyRewardsLamports).toFixed(5)} SOL/mo · 7.5% APY via Marinade`
                : 'Deposit SOL to see estimated rewards'}
            </div>
          </div>
          <div className="card-elevated">
            <div className="text-sm font-medium text-slate-500 mb-1">Active Stake Accounts</div>
            <div className="text-3xl font-bold text-slate-800 dark:text-slate-100 mb-1">{stakeAccounts.length}</div>
            <div className="text-xs text-slate-400">Full custody — your withdrawal authority</div>
          </div>
        </div>

        {/* Progress */}
        <div className="card-elevated animate-fade-scale">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">Group Progress</h2>
            <span className="text-2xl font-bold gradient-text">{progress}%</span>
          </div>
          <div className="progress-bar h-4 mb-3">
            <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="grid grid-cols-3 gap-4 text-center text-sm">
            <div><div className="font-bold text-emerald-600">{formatSol(group.total_staked || 0)}</div><div className="text-xs text-slate-400">Total Staked</div></div>
            <div><div className="font-bold text-slate-600 dark:text-slate-300">{formatSol(Math.max(0, (group.target_amount || 0) - (group.total_staked || 0)))}</div><div className="text-xs text-slate-400">Remaining</div></div>
            <div><div className="font-bold text-amber-600">{group.duration_months} mo</div><div className="text-xs text-slate-400">Duration</div></div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-6 border-b border-slate-200 dark:border-slate-700">
          {(['overview', 'members', 'history'] as Tab[]).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`pb-3 px-1 text-sm font-medium capitalize ${activeTab === tab ? 'tab-active' : 'tab-inactive'}`}>{tab}</button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="card">
              <h3 className="font-semibold mb-4 text-slate-800 dark:text-slate-100">Group Info</h3>
              <div className="space-y-2 text-sm">
                {[
                  ['Monthly', formatSol(group.monthly_contribution)],
                  ['Duration', `${group.duration_months} months`],
                  ['Max Members', group.max_members],
                  ['Created', new Date(group.created_at).toLocaleDateString('id-ID')],
                  ['Invite Code', group.invite_code],
                ].map(([k, v]) => (
                  <div key={k as string} className="flex justify-between items-center">
                    <span className="text-slate-500">{k}</span>
                    {k === 'Invite Code' ? (
                      <div className="flex items-center gap-2">
                        <span className="font-medium font-mono text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded select-all">{v}</span>
                        <button 
                          onClick={() => {
                            navigator.clipboard.writeText(v as string);
                            alert('Invite code copied: ' + v);
                          }}
                          className="text-emerald-600 hover:text-emerald-700 p-1 bg-emerald-50 dark:bg-emerald-900/30 rounded"
                          title="Copy Invite Code"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <span className="font-medium font-mono text-xs">{v}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
            {myMembership && (
              <div className="card">
                <h3 className="font-semibold mb-4 text-slate-800 dark:text-slate-100">Your Stats</h3>
                <div className="space-y-2 text-sm">
                  {[
                    ['Staked', formatSol(myMembership.total_deposited)],
                    ['Deposits', myMembership.deposit_count],
                    ['Streak', `${myMembership.streak_count} months 🔥`],
                    ['Joined', new Date(myMembership.joined_at).toLocaleDateString('id-ID')],
                  ].map(([k, v]) => (
                    <div key={k as string} className="flex justify-between">
                      <span className="text-slate-500">{k}</span>
                      <span className="font-medium">{v}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-xl text-xs text-orange-700">
                  🌊 Your SOL is staked via Marinade Native — you retain full withdrawal authority over your stake accounts.
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'members' && (
          <div className="space-y-3">
            {leaderboard.length === 0 && <div className="text-center py-16 text-slate-400">No members yet.</div>}
            {leaderboard.map((m: any, i: number) => (
              <div key={m.member_id} className="card flex items-center gap-4">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-slate-200 text-slate-600' : i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-slate-50 text-slate-400'}`}>
                  {i < 3 ? ['🥇','🥈','🥉'][i] : `#${i+1}`}
                </div>
                <div className="flex-1">
                  <div className="font-medium text-slate-800 dark:text-slate-100">{m.username || shortenAddress(m.wallet_address)}</div>
                  <div className="text-xs text-slate-400">{m.deposit_count} deposits · {m.streak_count} streak</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-emerald-600">{formatSol(m.total_deposited)}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-3">
            {[...deposits.map(d => ({ ...d, kind: 'deposit' })), ...withdrawals.map(w => ({ ...w, kind: 'withdraw' }))].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((item: any) => (
              <div key={item.id} className="card flex items-center gap-4">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-lg ${item.kind === 'deposit' ? 'bg-emerald-50' : 'bg-red-50'}`}>
                  {item.kind === 'deposit' ? '⬆️' : '⬇️'}
                </div>
                <div className="flex-1">
                  <div className="font-medium text-sm text-slate-800 dark:text-slate-100">
                    {item.kind === 'deposit' ? 'Deposit' : `Withdraw (${item.withdraw_type || ''})`}
                  </div>
                  <div className="text-xs text-slate-400">{new Date(item.created_at).toLocaleDateString('id-ID')}</div>
                </div>
                <div className="text-right">
                  <div className={`font-semibold text-sm ${item.kind === 'deposit' ? 'text-emerald-600' : 'text-red-500'}`}>
                    {item.kind === 'deposit' ? '+' : '-'}{formatSol(item.amount_lamports || 0)}
                  </div>
                  <a href={getExplorerUrl(item.tx_hash, 'tx')} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline">TX ↗</a>
                </div>
              </div>
            ))}
            {deposits.length === 0 && withdrawals.length === 0 && <div className="text-center py-16 text-slate-400">No transactions yet.</div>}
          </div>
        )}
      </main>

      {/* Deposit Modal */}
      {showDepositModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="card-elevated max-w-md w-full animate-fade-scale">
            <h2 className="text-xl font-bold mb-1">Deposit SOL</h2>
            <p className="text-sm text-slate-500 mb-4">SOL will be staked via Marinade Native to 100+ validators. You keep full custody.</p>
            <div className="marinade-badge mb-4">🌊 Marinade Native · ~7-8% APY · No smart contract risk</div>
            <div className="mb-4">
              <label className="label">Amount (SOL)</label>
              <input id="deposit-amount-input" type="number" step="0.01" min="0.01" className="input-field text-lg" placeholder="1.0" value={depositSol} onChange={e => setDepositSol(e.target.value)} />
              {depositSol && <span className="text-xs text-emerald-600 mt-1 block">≈ {formatRupiah(parseFloat(depositSol || '0') * 2_400_000)}</span>}
            </div>
            {txMsg && <div className={`mb-4 p-3 rounded-xl text-sm ${txMsg.startsWith('✅') ? 'bg-emerald-50 text-emerald-700' : txMsg.startsWith('❌') ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>{txMsg}</div>}
            <div className="flex gap-3">
              <button id="confirm-deposit-btn" onClick={handleDeposit} disabled={txLoading || !depositSol} className="btn-primary flex-1">
                {txLoading ? <span className="flex items-center justify-center gap-2"><span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />Processing…</span> : 'Stake & Deposit'}
              </button>
              <button onClick={() => { setShowDepositModal(false); setTxMsg(''); }} className="btn-secondary" disabled={txLoading}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Withdraw Modal */}
      {showWithdrawModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="card-elevated max-w-md w-full animate-fade-scale">
            <h2 className="text-xl font-bold mb-1">Withdraw SOL</h2>
            <p className="text-sm text-slate-500 mb-4">Select a stake account and withdrawal type.</p>
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="label mb-0">Stake Account</label>
                <button 
                  onClick={() => setWithdrawAll(!withdrawAll)}
                  className={`text-xs px-2 py-1 rounded-lg transition-colors ${withdrawAll ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}
                >
                  {withdrawAll ? '✓ Withdraw All' : 'Select All'}
                </button>
              </div>
              {!withdrawAll ? (
                <select id="stake-account-select" className="select-field" value={selectedStakeAccount} onChange={e => setSelectedStakeAccount(e.target.value)}>
                  <option value="">-- Select stake account --</option>
                  {stakeAccounts.map((a: any) => (
                    <option key={a.pubkey?.toBase58()} value={a.pubkey?.toBase58()}>
                      {shortenAddress(a.pubkey?.toBase58() || '')} — {lamportsToSol(a.lamports || 0).toFixed(3)} SOL 
                      ({a.state === 'staking' ? 'Active' : a.state === 'preparingToRevoke' ? 'Deactivating' : a.state === 'readyToRevoke' ? 'Ready' : 'Other'})
                    </option>
                  ))}
                </select>
              ) : (
                <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                  <div className="text-emerald-700 font-semibold">Total: {lamportsToSol(stakeAccounts.reduce((s, a) => s + (a.lamports || 0), 0)).toFixed(4)} SOL</div>
                  <div className="text-xs text-emerald-600">{stakeAccounts.length} accounts selected</div>
                </div>
              )}
            </div>
            <div className="mb-4 grid grid-cols-2 gap-3">
              <button onClick={() => setWithdrawType('delayed')} className={`p-3 rounded-xl border-2 text-sm text-left transition-all ${withdrawType === 'delayed' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200'}`}>
                <div className="font-semibold">⏳ Delayed</div>
                <div className="text-xs text-slate-500 mt-1">Free · ~1 epoch (2-3 days)</div>
              </button>
              <button onClick={() => setWithdrawType('instant')} className={`p-3 rounded-xl border-2 text-sm text-left transition-all ${withdrawType === 'instant' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200'}`}>
                <div className="font-semibold">⚡ Instant</div>
                <div className="text-xs text-slate-500 mt-1">~0.1-0.4% fee · Immediate</div>
              </button>
            </div>
            {txMsg && <div className={`mb-4 p-3 rounded-xl text-sm ${txMsg.startsWith('✅') ? 'bg-emerald-50 text-emerald-700' : txMsg.startsWith('❌') ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>{txMsg}</div>}
            <div className="flex gap-3">
              <button id="confirm-withdraw-btn" onClick={handleWithdraw} disabled={txLoading || !selectedStakeAccount} className="btn-primary flex-1">
                {txLoading ? <span className="flex items-center justify-center gap-2"><span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />Processing…</span> : 'Confirm Withdraw'}
              </button>
              <button onClick={() => { setShowWithdrawModal(false); setTxMsg(''); }} className="btn-secondary" disabled={txLoading}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
