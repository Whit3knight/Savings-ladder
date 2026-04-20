'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useWallet } from '../providers/WalletProvider';
import { shortenAddress, formatRupiah } from '../lib/solana';
import { getOrCreateUser, getUserGroups, getUserLoans, getUserAchievements } from '../lib/supabase';

export default function DashboardPage() {
  const { isConnected, walletAddress, connect, disconnect } = useWallet();
  const [activeTab, setActiveTab] = useState<'groups' | 'loans' | 'achievements'>('groups');
  const [groups, setGroups] = useState<any[]>([]);
  const [loans, setLoans] = useState<any[]>([]);
  const [achievements, setAchievements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      if (!walletAddress) return;
      setLoading(true);
      try {
        const user = await getOrCreateUser(walletAddress);
        const [g, l, a] = await Promise.all([getUserGroups(user.id), getUserLoans(user.id), getUserAchievements(user.id)]);
        setGroups(g || []); setLoans(l || []); setAchievements(a || []);
      } catch (err) { console.error(err); } finally { setLoading(false); }
    }
    loadData();
  }, [walletAddress]);

  const totalSaved = groups.reduce((s, g) => s + (g.total_deposited || 0), 0);
  const activeGroups = groups.filter(g => g.group?.status === 'active').length;

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="text-6xl mb-6">🪜</div>
          <h1 className="font-display text-3xl font-bold text-slate-900 dark:text-slate-50 mb-4">Connect Your Wallet</h1>
          <p className="text-slate-600 dark:text-slate-300 mb-8">Connect your Phantom wallet to access your dashboard.</p>
          <button onClick={connect} className="btn-primary text-lg !px-8 !py-4">Connect Phantom Wallet</button>
          <Link href="/" className="block mt-4 text-sm text-slate-500 dark:text-slate-500 hover:text-emerald-600">← Back to Home</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <header className="glass sticky top-0 z-50 border-b border-slate-200 dark:border-slate-700/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2"><span className="text-xl">🪜</span><span className="font-display font-bold text-lg text-slate-800 dark:text-slate-100">Savings<span className="gradient-text">Ladder</span></span></Link>
          <div className="flex items-center gap-3">
            <span className="hidden sm:block text-sm text-slate-500 dark:text-slate-500">{shortenAddress(walletAddress || '', 6)}</span>
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <button onClick={disconnect} className="btn-ghost text-sm">Disconnect</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="font-display text-2xl md:text-3xl font-bold text-slate-900 dark:text-slate-50">Welcome back 👋</h1>
          <p className="text-slate-500 dark:text-slate-500 mt-1">Here&apos;s your savings overview.</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="stat-card animate-fade-scale">
            <div className="flex items-center gap-2 mb-2"><span className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-lg">💰</span><span className="stat-label">Total Saved</span></div>
            <div className="stat-value text-emerald-600">{formatRupiah(totalSaved)}</div>
          </div>
          <div className="stat-card animate-fade-scale" style={{ animationDelay: '0.1s' }}>
            <div className="flex items-center gap-2 mb-2"><span className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-lg">✨</span><span className="stat-label">Interest</span></div>
            <div className="stat-value text-amber-600">{formatRupiah(Math.round(totalSaved * 0.05))}</div>
          </div>
          <div className="stat-card animate-fade-scale" style={{ animationDelay: '0.2s' }}>
            <div className="flex items-center gap-2 mb-2"><span className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-lg">👥</span><span className="stat-label">Groups</span></div>
            <div className="stat-value">{activeGroups}</div>
          </div>
          <div className="stat-card animate-fade-scale" style={{ animationDelay: '0.3s' }}>
            <div className="flex items-center gap-2 mb-2"><span className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center text-lg">💳</span><span className="stat-label">Loans</span></div>
            <div className="stat-value">{loans.filter(l => l.status === 'active').length}</div>
          </div>
        </div>

        <div className="flex gap-3 mb-8">
          <Link href="/create-group" className="btn-primary flex items-center gap-2"><span>+</span> Create Group</Link>
          <button className="btn-outline flex items-center gap-2"><span>+</span> Join Group</button>
        </div>

        <div className="flex gap-6 border-b border-slate-200 dark:border-slate-700 mb-6">
          {(['groups', 'loans', 'achievements'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`pb-3 px-1 text-sm font-medium capitalize transition-colors ${activeTab === tab ? 'tab-active' : 'tab-inactive'}`}>
              {tab} ({tab === 'groups' ? groups.length : tab === 'loans' ? loans.length : achievements.length})
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full" /></div>
        ) : activeTab === 'groups' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {groups.length === 0 ? (
              <div className="col-span-full text-center py-16">
                <div className="text-5xl mb-4">🪜</div><h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-2">No groups yet</h3>
                <Link href="/create-group" className="btn-primary">Create Your First Group</Link>
              </div>
            ) : groups.map(item => {
              const g = item.group; if (!g) return null;
              const progress = g.target_amount > 0 ? Math.min(100, Math.round((g.total_accumulated / g.target_amount) * 100)) : 0;
              return (
                <Link key={item.id} href={`/group/${g.id}`} className="card-elevated group cursor-pointer hover:scale-[1.02] transition-transform">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-3xl">{g.emoji || '🪜'}</span>
                    <div><h3 className="font-semibold text-slate-800 dark:text-slate-100">{g.name}</h3><span className="text-xs text-emerald-600">{g.status === 'active' ? '🟢 Active' : g.status}</span></div>
                  </div>
                  <div className="mb-4">
                    <div className="flex justify-between text-xs text-slate-500 dark:text-slate-500 mb-1.5"><span>{progress}%</span><span>{formatRupiah(g.total_accumulated)} / {formatRupiah(g.target_amount)}</span></div>
                    <div className="progress-bar h-2"><div className="progress-bar-fill" style={{ width: `${progress}%` }} /></div>
                  </div>
                  <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-300"><span>👥 {g.total_members}/{g.max_members}</span><span>Monthly: {formatRupiah(g.monthly_contribution)}</span></div>
                </Link>
              );
            })}
          </div>
        ) : activeTab === 'loans' ? (
          <div className="space-y-4">
            {loans.length === 0 ? <div className="text-center py-16"><div className="text-5xl mb-4">💳</div><p className="text-slate-500 dark:text-slate-500">No loans yet. After 3 deposits, unlock microloans at 0.5%/month.</p></div>
            : loans.map(loan => (
              <div key={loan.id} className="card-elevated flex items-center gap-4">
                <span className="text-2xl">{loan.group?.emoji || '💳'}</span>
                <div className="flex-1"><div className="font-semibold text-slate-800 dark:text-slate-100">{loan.group?.name}</div><span className={loan.status === 'active' ? 'badge-warning' : 'badge-success'}>{loan.status}</span></div>
                <div className="text-right"><div className="text-lg font-bold">{formatRupiah(loan.loan_amount)}</div><div className="text-xs text-slate-500 dark:text-slate-500">{formatRupiah(loan.remaining_amount)} remaining</div></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {achievements.length === 0 ? <div className="col-span-full text-center py-16"><div className="text-5xl mb-4">🏆</div><p className="text-slate-500 dark:text-slate-500">Start saving to earn badges!</p></div>
            : achievements.map(b => (
              <div key={b.id} className="card text-center"><div className="text-4xl mb-3">{b.badge_emoji}</div><h3 className="font-semibold text-slate-800 dark:text-slate-100 text-sm">{b.badge_name}</h3><p className="text-xs text-slate-500 dark:text-slate-500 mt-1">{b.badge_description}</p></div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
