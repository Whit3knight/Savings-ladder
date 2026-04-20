'use client';
import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useWallet } from '../providers/WalletProvider';
import { createGroup, formatRupiah, displayToUsdc } from '../lib/solana';
import { saveGroup, getOrCreateUser } from '../lib/supabase';

const EMOJIS = ['🪜', '🏖️', '🏠', '🎓', '🚗', '💍', '🎮', '💻', '✈️', '🏥'];
const DURATIONS = [3, 6, 9, 12, 18, 24, 36];

export default function CreateGroupPage() {
  const { isConnected, walletAddress, connect } = useWallet();
  const router = useRouter();
  const [form, setForm] = useState({ name: '', emoji: '🪜', description: '', targetAmount: '', monthlyContribution: '', durationMonths: 12, maxMembers: 10 });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const projection = useMemo(() => {
    const monthly = Number(form.monthlyContribution) || 0;
    const target = Number(form.targetAmount) || 0;
    const total = monthly * form.durationMonths;
    const interest = Math.round(total * 0.05 * (form.durationMonths / 12));
    const coverage = target > 0 ? Math.min(100, Math.round((total / target) * 100)) : 0;
    return { total, interest, coverage, achievable: total >= target };
  }, [form]);

  const isValid = form.name.length > 0 && form.name.length <= 50 && Number(form.targetAmount) >= 1000000 && Number(form.monthlyContribution) >= 100000;

  async function handleSubmit() {
    if (!isValid || !walletAddress) return;
    setSubmitting(true); setError(null);
    try {
      const wallet = (window as any).solana;
      const txSig = await createGroup(wallet, { name: form.name, targetAmount: displayToUsdc(Number(form.targetAmount)), monthlyContribution: displayToUsdc(Number(form.monthlyContribution)), durationMonths: form.durationMonths, maxMembers: form.maxMembers });
      const user = await getOrCreateUser(walletAddress);
      const saved = await saveGroup({ group_pubkey: txSig, creator_id: user.id, name: form.name, emoji: form.emoji, description: form.description, target_amount: Number(form.targetAmount), monthly_contribution: Number(form.monthlyContribution), duration_months: form.durationMonths, max_members: form.maxMembers });
      router.push(`/group/${saved.id}`);
    } catch (err: any) { setError(err.message || 'Failed to create group'); } finally { setSubmitting(false); }
  }

  if (!isConnected) {
    return (<div className="min-h-screen bg-[var(--bg)] flex items-center justify-center"><div className="text-center max-w-md mx-auto px-4"><div className="text-6xl mb-6">🪜</div><h1 className="font-display text-3xl font-bold text-slate-900 dark:text-slate-50 mb-4">Connect to Create</h1><button onClick={connect} className="btn-primary text-lg !px-8 !py-4">Connect Wallet</button></div></div>);
  }

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <header className="glass sticky top-0 z-50 border-b border-slate-200 dark:border-slate-700/50"><div className="max-w-3xl mx-auto px-4 h-16 flex items-center"><Link href="/dashboard" className="flex items-center gap-2 text-slate-600 dark:text-slate-300 hover:text-emerald-600"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>Back to Dashboard</Link></div></header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="font-display text-3xl font-bold text-slate-900 dark:text-slate-50 mb-2">Create Savings Group</h1>
        <p className="text-slate-500 dark:text-slate-500 mb-8">Set up a new group and invite friends to save together.</p>

        <div className="space-y-8">
          {/* Basics */}
          <div className="card-elevated">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-6">Group Basics</h2>
            <div className="mb-5"><label className="label">Group Name *</label><input type="text" className="input-field" placeholder="e.g., Liburan Bali 2025" maxLength={50} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /><span className="text-xs text-slate-400 dark:text-slate-500 block text-right mt-1">{form.name.length}/50</span></div>
            <div className="mb-5"><label className="label">Icon</label><div className="flex gap-2 flex-wrap">{EMOJIS.map(e => (<button key={e} onClick={() => setForm({ ...form, emoji: e })} className={`w-12 h-12 text-2xl rounded-xl border-2 transition-all hover:scale-110 ${form.emoji === e ? 'border-emerald-500 bg-emerald-50 scale-110' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'}`}>{e}</button>))}</div></div>
            <div><label className="label">Description (optional)</label><textarea className="input-field min-h-[80px] resize-none" placeholder="What are we saving for?" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
          </div>

          {/* Financial */}
          <div className="card-elevated">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-6">Financial Settings</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div><label className="label">Target Amount (Rp) *</label><input type="number" className="input-field" placeholder="15000000" min="1000000" value={form.targetAmount} onChange={e => setForm({ ...form, targetAmount: e.target.value })} />{form.targetAmount && <span className="text-xs text-emerald-600 mt-1 block">{formatRupiah(Number(form.targetAmount))}</span>}</div>
              <div><label className="label">Monthly (Rp) *</label><input type="number" className="input-field" placeholder="1500000" min="100000" value={form.monthlyContribution} onChange={e => setForm({ ...form, monthlyContribution: e.target.value })} />{form.monthlyContribution && <span className="text-xs text-emerald-600 mt-1 block">{formatRupiah(Number(form.monthlyContribution))}</span>}</div>
              <div><label className="label">Duration</label><select className="select-field" value={form.durationMonths} onChange={e => setForm({ ...form, durationMonths: Number(e.target.value) })}>{DURATIONS.map(d => <option key={d} value={d}>{d} months</option>)}</select></div>
              <div><label className="label">Max Members</label><select className="select-field" value={form.maxMembers} onChange={e => setForm({ ...form, maxMembers: Number(e.target.value) })}>{[5,10,15,20,30,50].map(n => <option key={n} value={n}>{n} members</option>)}</select></div>
            </div>
          </div>

          {/* Projection */}
          <div className="card-elevated">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-6">Savings Projection</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div><div className="text-sm text-slate-500 dark:text-slate-500">Monthly</div><div className="text-lg font-bold">{formatRupiah(Number(form.monthlyContribution) || 0)}</div></div>
              <div><div className="text-sm text-slate-500 dark:text-slate-500">Duration</div><div className="text-lg font-bold">{form.durationMonths} mo</div></div>
              <div><div className="text-sm text-slate-500 dark:text-slate-500">Total/Person</div><div className="text-lg font-bold">{formatRupiah(projection.total)}</div></div>
              <div><div className="text-sm text-slate-500 dark:text-slate-500">+ Interest</div><div className="text-lg font-bold text-emerald-600">{formatRupiah(projection.interest)}</div></div>
            </div>
            <div className="flex justify-between text-sm mb-2"><span>Achievability</span><span className={`font-semibold ${projection.achievable ? 'text-emerald-600' : 'text-amber-600'}`}>{projection.coverage}%</span></div>
            <div className="progress-bar h-3"><div className={`h-full rounded-full transition-all duration-700 ${projection.achievable ? 'bg-gradient-to-r from-emerald-500 to-emerald-400' : 'bg-gradient-to-r from-amber-500 to-amber-400'}`} style={{ width: `${projection.coverage}%` }} /></div>
          </div>

          {error && <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>}

          <div className="flex gap-4">
            <button onClick={handleSubmit} disabled={!isValid || submitting} className="btn-primary flex-1 text-lg !py-4">
              {submitting ? <span className="flex items-center justify-center gap-2"><span className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />Creating...</span> : 'Create Group'}
            </button>
            <Link href="/dashboard" className="btn-secondary !py-4 px-8">Cancel</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
