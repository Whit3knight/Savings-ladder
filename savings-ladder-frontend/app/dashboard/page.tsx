'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useWallet } from '../providers/WalletProvider';
import { shortenAddress, formatSol, lamportsToSol, getUserStakeAccounts, fetchStakingRewards, joinGroup } from '../lib/solana';
import { getOrCreateUser, getUserGroups, getCreatorGroups, getUserAchievements, getGroupByInviteCode, saveMember } from '../lib/supabase';
import { PublicKey } from '@solana/web3.js';

export default function DashboardPage() {
  const { isConnected, walletAddress, connect, disconnect } = useWallet();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'groups' | 'achievements'>('groups');
  const [groups, setGroups] = useState<any[]>([]);
  const [achievements, setAchievements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalStaked, setTotalStaked] = useState(0);
  const [rewards, setRewards] = useState<any | null>(null);

  const [showJoinModal, setShowJoinModal] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinMsg, setJoinMsg] = useState('');

  useEffect(() => {
    async function loadData() {
      if (!walletAddress) return;
      setLoading(true);
      try {
        const user = await getOrCreateUser(walletAddress);

        // Load group memberships (as member) and groups where user is creator
        const [memberGroupsRes, creatorGroupsRes, achievementsRes] = await Promise.allSettled([
          getUserGroups(user.id),
          getCreatorGroups(user.id),
          getUserAchievements(user.id),
        ]);

        // Merge member + creator groups, de-duplicate by group id
        const memberGroups: any[] = memberGroupsRes.status === 'fulfilled' ? memberGroupsRes.value || [] : [];
        const creatorGroups: any[] = creatorGroupsRes.status === 'fulfilled' ? creatorGroupsRes.value || [] : [];
        const seen = new Set<string>();
        const merged: any[] = [];
        for (const item of memberGroups) {
          const gid = item.group?.id;
          if (gid && !seen.has(gid)) { seen.add(gid); merged.push(item); }
        }
        for (const g of creatorGroups) {
          if (!seen.has(g.id)) { seen.add(g.id); merged.push({ id: g.id, group: g }); }
        }
        setGroups(merged);
        setAchievements(achievementsRes.status === 'fulfilled' ? achievementsRes.value || [] : []);

        // Calculate total staked from Supabase data (reliable across Devnet & Mainnet)
        // memberGroups contains total_deposited per group_member record
        const totalFromDb = memberGroups.reduce((sum: number, item: any) => sum + (item.total_deposited || 0), 0);
        setTotalStaked(totalFromDb);
      } catch (err) { console.error(err); } finally { setLoading(false); }
    }

    loadData();
  }, [walletAddress]);

  const APY = 0.075;
  const estimatedAnnualRewards = Math.round(totalStaked * APY);
  const estimatedMonthlyRewards = Math.round(estimatedAnnualRewards / 12);

  async function handleJoinGroup() {
    if (!walletAddress || !inviteCode) return;
    setJoinLoading(true); setJoinMsg('Searching for group...');
    try {
      const groupData = await getGroupByInviteCode(inviteCode);
      if (!groupData) {
        setJoinMsg('❌ Group not found. Check the invite code.');
        setJoinLoading(false);
        return;
      }

      setJoinMsg('Joining on-chain...');
      const wallet = (window as any).solana;
      const groupPubkey = new PublicKey(groupData.group_pubkey);
      
      try {
        await joinGroup(wallet, groupPubkey);
      } catch (joinErr: any) {
        const msg = joinErr?.message ?? '';
        const alreadyJoined =
          msg.includes('already in use') ||
          msg.includes('already been processed') ||
          msg.includes('AlreadyInitialized') ||
          msg.includes('custom program error: 0x0');
        if (!alreadyJoined) throw joinErr;
      }

      setJoinMsg('Saving to database...');
      const user = await getOrCreateUser(walletAddress);
      await saveMember({ 
        group_id: groupData.id, 
        user_id: user.id, 
        member_pubkey: walletAddress 
      }).catch(() => {}); // ignore duplicate errors if they are already in the DB

      setJoinMsg('✅ Successfully joined! Redirecting...');
      setTimeout(() => {
        router.push(`/group/${groupData.id}`);
      }, 1000);
      
    } catch (e: any) {
      setJoinMsg(`❌ Error: ${e.message}`);
    } finally {
      setJoinLoading(false);
    }
  }

  const activeGroups = groups.filter(g => g.group?.status === 'active').length;

  if (!isConnected) return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center">
      <div className="text-center max-w-md mx-auto px-4">
        <div className="text-6xl mb-6">🪜</div>
        <h1 className="font-display text-3xl font-bold text-slate-900 dark:text-slate-50 mb-4">Connect Your Wallet</h1>
        <p className="text-slate-600 mb-8">Connect your Phantom wallet to access your dashboard.</p>
        <button onClick={connect} className="btn-primary text-lg !px-8 !py-4">Connect Phantom Wallet</button>
        <Link href="/" className="block mt-4 text-sm text-slate-500 hover:text-emerald-600">← Back to Home</Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <header className="glass sticky top-0 z-50 border-b border-slate-200 dark:border-slate-700/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl">🪜</span>
            <span className="font-display font-bold text-lg text-slate-800 dark:text-slate-100">Savings<span className="gradient-text">Ladder</span></span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="marinade-badge hidden sm:inline-flex">🌊 Marinade Native</span>
            <span className="hidden sm:block text-sm text-slate-500">{shortenAddress(walletAddress || '', 6)}</span>
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <button onClick={disconnect} className="btn-ghost text-sm">Disconnect</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="font-display text-2xl md:text-3xl font-bold text-slate-900 dark:text-slate-50">Welcome back 👋</h1>
          <p className="text-slate-500 mt-1">Your Marinade Native staking savings overview.</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { icon: '💰', label: 'Total Staked', value: formatSol(totalStaked), color: 'text-emerald-600' },
            { icon: '✨', label: 'Est. Annual Rewards', value: totalStaked > 0 ? `+${formatSol(estimatedAnnualRewards)}/yr` : '—', color: 'text-amber-600' },
            { icon: '👥', label: 'Active Groups', value: activeGroups, color: '' },
            { icon: '🏆', label: 'Achievements', value: achievements.length, color: 'text-purple-600' },
          ].map((s, i) => (
            <div key={s.label} className="stat-card animate-fade-scale" style={{ animationDelay: `${i * 0.1}s` }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-lg">{s.icon}</span>
                <span className="stat-label">{s.label}</span>
              </div>
              <div className={`stat-value ${s.color}`}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-3 mb-8">
          <Link href="/create-group" id="create-group-btn" className="btn-primary flex items-center gap-2">+ Create Group</Link>
          <button onClick={() => setShowJoinModal(true)} className="btn-outline flex items-center gap-2">+ Join Group</button>
        </div>

        {/* Tabs */}
        <div className="flex gap-6 border-b border-slate-200 dark:border-slate-700 mb-6">
          {(['groups', 'achievements'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`pb-3 px-1 text-sm font-medium capitalize transition-colors ${activeTab === tab ? 'tab-active' : 'tab-inactive'}`}>
              {tab} ({tab === 'groups' ? groups.length : achievements.length})
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full" /></div>
        ) : activeTab === 'groups' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {groups.length === 0 ? (
              <div className="col-span-full text-center py-16">
                <div className="text-5xl mb-4">🪜</div>
                <h3 className="text-lg font-semibold text-slate-700 mb-2">No groups yet</h3>
                <Link href="/create-group" className="btn-primary">Create Your First Group</Link>
              </div>
            ) : groups.map(item => {
              const g = item.group; if (!g) return null;
              const progress = g.target_amount > 0 ? Math.min(100, Math.round((g.total_staked / g.target_amount) * 100)) : 0;
              return (
                <Link key={item.id} href={`/group/${g.id}`} className="card-elevated group cursor-pointer hover:scale-[1.02] transition-transform">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-3xl">{g.emoji || '🪜'}</span>
                    <div><h3 className="font-semibold text-slate-800 dark:text-slate-100">{g.name}</h3><span className="text-xs text-emerald-600">{g.status === 'active' ? '🟢 Active' : g.status}</span></div>
                  </div>
                  <div className="mb-4">
                    <div className="flex justify-between text-xs text-slate-500 mb-1.5"><span>{progress}%</span><span>{formatSol(g.total_staked)} / {formatSol(g.target_amount)}</span></div>
                    <div className="progress-bar h-2"><div className="progress-bar-fill" style={{ width: `${progress}%` }} /></div>
                  </div>
                  <div className="flex items-center justify-between text-sm text-slate-600">
                    <span>👥 {g.total_members}/{g.max_members}</span>
                    <span className="marinade-badge text-xs">🌊 ~7-8% APY</span>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {achievements.length === 0
              ? <div className="col-span-full text-center py-16"><div className="text-5xl mb-4">🏆</div><p className="text-slate-500">Start saving to earn badges!</p></div>
              : achievements.map(b => (
                <div key={b.id} className="card text-center"><div className="text-4xl mb-3">{b.badge_emoji}</div><h3 className="font-semibold text-slate-800 text-sm">{b.badge_name}</h3><p className="text-xs text-slate-500 mt-1">{b.badge_description}</p></div>
              ))}
          </div>
        )}
      </main>

      {/* Join Group Modal */}
      {showJoinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="card-elevated max-w-md w-full animate-fade-scale">
            <h2 className="text-xl font-bold mb-1">Join a Group</h2>
            <p className="text-sm text-slate-500 mb-4">Enter the invite code from the group creator.</p>
            <div className="mb-4">
              <label className="label">Invite Code</label>
              <input type="text" className="input-field text-lg font-mono text-center tracking-wider" placeholder="e.g. a1b2c3d4" value={inviteCode} onChange={e => setInviteCode(e.target.value.trim())} />
            </div>
            {joinMsg && <div className={`mb-4 p-3 rounded-xl text-sm ${joinMsg.startsWith('✅') ? 'bg-emerald-50 text-emerald-700' : joinMsg.startsWith('❌') ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>{joinMsg}</div>}
            <div className="flex gap-3">
              <button onClick={handleJoinGroup} disabled={joinLoading || !inviteCode} className="btn-primary flex-1">
                {joinLoading ? <span className="flex items-center justify-center gap-2"><span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />Joining…</span> : 'Join Group'}
              </button>
              <button onClick={() => { setShowJoinModal(false); setJoinMsg(''); setInviteCode(''); }} className="btn-secondary" disabled={joinLoading}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
