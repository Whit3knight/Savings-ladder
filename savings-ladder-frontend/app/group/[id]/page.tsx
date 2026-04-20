'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useWallet } from '../../providers/WalletProvider';
import { formatRupiah, shortenAddress, getExplorerUrl, displayToUsdc, depositMonthly } from '../../lib/solana';
import { getGroupDetails, getGroupDeposits, getLeaderboard, getOrCreateUser, saveDeposit } from '../../lib/supabase';
import { PublicKey } from '@solana/web3.js';

export default function GroupDetailPage() {
  const params = useParams();
  const groupId = params.id as string;
  const { isConnected, walletAddress } = useWallet();
  const [group, setGroup] = useState<any>(null);
  const [deposits, setDeposits] = useState<any[]>([]);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'members' | 'deposits'>('overview');
  const [showModal, setShowModal] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');
  const [depositing, setDepositing] = useState(false);

  useEffect(() => {
    async function load() {
      if (!groupId) return;
      setLoading(true);
      try {
        const [g, d, l] = await Promise.all([getGroupDetails(groupId), getGroupDeposits(groupId), getLeaderboard(groupId)]);
        setGroup(g); setDeposits(d || []); setLeaderboard(l || []);
        if (g?.monthly_contribution) setDepositAmount(String(g.monthly_contribution));
      } catch (err) { console.error(err); } finally { setLoading(false); }
    }
    load();
  }, [groupId]);

  const myMembership = group?.members?.find((m: any) => m.user?.wallet_address === walletAddress);
  const progress = group?.target_amount > 0 ? Math.min(100, Math.round((group.total_accumulated / group.target_amount) * 100)) : 0;

  async function handleDeposit() {
    if (!walletAddress || !group || !depositAmount) return;
    setDepositing(true);
    try {
      const wallet = (window as any).solana;
      const tx = await depositMonthly(wallet, new PublicKey(group.group_pubkey), displayToUsdc(Number(depositAmount)));
      const user = await getOrCreateUser(walletAddress);
      await saveDeposit({ group_id: groupId, member_id: myMembership?.id, amount: Number(depositAmount), tx_hash: tx });
      const [g, d] = await Promise.all([getGroupDetails(groupId), getGroupDeposits(groupId)]);
      setGroup(g); setDeposits(d || []); setShowModal(false);
    } catch (err: any) { alert(err.message || 'Deposit failed'); } finally { setDepositing(false); }
  }

  if (loading) return <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center"><div className="animate-spin w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full" /></div>;
  if (!group) return <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center"><div className="text-center"><div className="text-5xl mb-4">🔍</div><h1 className="text-xl font-bold mb-2">Group Not Found</h1><Link href="/dashboard" className="btn-primary">Back</Link></div></div>;

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <header className="glass sticky top-0 z-50 border-b border-slate-200 dark:border-slate-700/50"><div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2 text-slate-600 dark:text-slate-300 hover:text-emerald-600"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>Dashboard</Link>
        {isConnected && <button onClick={() => setShowModal(true)} className="btn-primary text-sm !px-4 !py-2">+ Deposit</button>}
      </div></header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Hero */}
        <div className="card-elevated mb-8">
          <div className="flex flex-col md:flex-row md:items-center gap-6">
            <div className="text-6xl">{group.emoji || '🪜'}</div>
            <div className="flex-1">
              <h1 className="font-display text-2xl md:text-3xl font-bold text-slate-900 dark:text-slate-50">{group.name}</h1>
              {group.description && <p className="text-slate-500 dark:text-slate-500 mt-1">{group.description}</p>}
              <div className="flex flex-wrap gap-4 mt-3 text-sm text-slate-600 dark:text-slate-300">
                <span>🎯 Target: <strong>{formatRupiah(group.target_amount)}</strong></span>
                <span>👥 {group.total_members}/{group.max_members}</span>
                <span className={group.status === 'active' ? 'text-emerald-600 font-medium' : 'text-slate-400 dark:text-slate-500'}>{group.status === 'active' ? '🟢 Active' : group.status}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Progress */}
        <div className="card-elevated mb-8">
          <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Progress</h2><span className="text-3xl font-bold gradient-text">{progress}%</span></div>
          <div className="progress-bar h-4 mb-4"><div className="progress-bar-fill" style={{ width: `${progress}%` }} /></div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div><div className="text-lg font-bold text-emerald-600">{formatRupiah(group.total_accumulated)}</div><div className="text-xs text-slate-500 dark:text-slate-500">Accumulated</div></div>
            <div><div className="text-lg font-bold text-slate-700 dark:text-slate-200">{formatRupiah(Math.max(0, group.target_amount - group.total_accumulated))}</div><div className="text-xs text-slate-500 dark:text-slate-500">Remaining</div></div>
            <div><div className="text-lg font-bold text-amber-600">{formatRupiah(Math.round(group.total_accumulated * 0.05))}</div><div className="text-xs text-slate-500 dark:text-slate-500">Interest (5%)</div></div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-6 border-b border-slate-200 dark:border-slate-700 mb-6">
          {(['overview', 'members', 'deposits'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`pb-3 px-1 text-sm font-medium capitalize ${activeTab === tab ? 'tab-active' : 'tab-inactive'}`}>{tab}</button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="card"><h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-4">Group Info</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-500">Monthly</span><span className="font-medium">{formatRupiah(group.monthly_contribution)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-500">Duration</span><span className="font-medium">{group.duration_months} months</span></div>
                <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-500">Created</span><span className="font-medium">{new Date(group.created_at).toLocaleDateString('id-ID')}</span></div>
                <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-500">Invite Code</span><span className="font-mono text-emerald-600">{group.invite_code}</span></div>
              </div>
            </div>
            {myMembership && <div className="card"><h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-4">Your Contribution</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-500">Deposited</span><span className="font-medium text-emerald-600">{formatRupiah(myMembership.total_deposited)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-500">Count</span><span className="font-medium">{myMembership.deposit_count}</span></div>
                <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-500">Loan Eligible</span><span className="font-medium">{myMembership.deposit_count >= 3 ? '✅ Yes' : `❌ ${3 - myMembership.deposit_count} more`}</span></div>
              </div>
              <button onClick={() => setShowModal(true)} className="btn-primary w-full mt-4">+ Make Deposit</button>
            </div>}
          </div>
        )}

        {activeTab === 'members' && (
          <div className="space-y-3">
            {leaderboard.map((m: any, i: number) => (
              <div key={m.member_id} className="card flex items-center gap-4">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${i < 3 ? ['bg-amber-100 text-amber-700', 'bg-slate-200 text-slate-600 dark:text-slate-300', 'bg-orange-100 text-orange-700'][i] : 'bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500'}`}>{i < 3 ? ['🥇','🥈','🥉'][i] : `#${i+1}`}</div>
                <div className="flex-1"><div className="font-medium text-slate-800 dark:text-slate-100">{m.username || shortenAddress(m.wallet_address)}</div><div className="text-xs text-slate-500 dark:text-slate-500">{m.deposit_count} deposits</div></div>
                <div className="text-right"><div className="font-semibold text-emerald-600">{formatRupiah(m.total_deposited)}</div></div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'deposits' && (
          <div className="space-y-3">
            {deposits.length === 0 ? <div className="text-center py-12 text-slate-500 dark:text-slate-500">No deposits yet.</div>
            : deposits.map((d: any) => (
              <div key={d.id} className="card flex items-center gap-4">
                <div className="text-xl">{d.member?.user?.avatar_emoji || '👤'}</div>
                <div className="flex-1"><div className="font-medium text-slate-800 dark:text-slate-100 text-sm">{d.member?.user?.username || shortenAddress(d.member?.user?.wallet_address || '')}</div><div className="text-xs text-slate-400 dark:text-slate-500">{new Date(d.created_at).toLocaleDateString('id-ID')}</div></div>
                <div className="text-right"><div className="font-semibold text-emerald-600 text-sm">{formatRupiah(d.amount)}</div><a href={getExplorerUrl(d.tx_hash, 'tx')} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline">TX ↗</a></div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${d.status === 'confirmed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{d.status}</span>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Deposit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="card-elevated max-w-md w-full animate-fade-scale">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50 mb-4">Make a Deposit</h2>
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-6 text-sm text-emerald-700">Monthly contribution: <strong>{formatRupiah(group.monthly_contribution)}</strong></div>
            <div className="mb-6"><label className="label">Amount (Rp)</label><input type="number" className="input-field text-lg" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} />{depositAmount && <span className="text-sm text-emerald-600 mt-1 block">{formatRupiah(Number(depositAmount))}</span>}</div>
            <div className="flex gap-3">
              <button onClick={handleDeposit} disabled={depositing || !depositAmount} className="btn-primary flex-1">{depositing ? <span className="flex items-center justify-center gap-2"><span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />Processing...</span> : 'Deposit'}</button>
              <button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
