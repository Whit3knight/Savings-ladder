'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useWallet } from '../../providers/WalletProvider';
import { getTreasuryBalance, getFeeRecords } from '../../lib/supabase';
import { formatSOL } from '../../lib/utils';

const PROGRAM_AUTHORITY = process.env.NEXT_PUBLIC_PROGRAM_AUTHORITY ?? '';

export default function TreasuryDashboard() {
  const { walletAddress } = useWallet();

  const [treasury, setTreasury] = useState<any>(null);
  const [feeRecords, setFeeRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const isAdmin = !PROGRAM_AUTHORITY || walletAddress === PROGRAM_AUTHORITY;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, r] = await Promise.all([getTreasuryBalance(), getFeeRecords(undefined, 20)]);
      setTreasury(t ?? null);
      setFeeRecords(r ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [load]);

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-4">🔒</div>
          <h1 className="text-xl font-bold mb-2">Admin Only</h1>
          <p className="text-slate-500 mb-4">This page is restricted to program authority.</p>
          <Link href="/dashboard" className="btn-primary">Back to Dashboard</Link>
        </div>
      </div>
    );
  }

  if (loading && !treasury) {
    return (
      <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center">
        <div className="animate-spin w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const totalCollected = treasury?.total_collected ?? 0;
  const treasuryBalance = treasury?.treasury_balance ?? 0;
  const liquidityBalance = treasury?.liquidity_balance ?? 0;
  const creatorBalance = totalCollected - treasuryBalance - liquidityBalance;

  const depositFees = feeRecords.filter(r => r.fee_type === 'deposit');
  const claimFees = feeRecords.filter(r => r.fee_type === 'claim');

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <header className="glass sticky top-0 z-50 border-b border-slate-200 dark:border-slate-700/50">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2 text-slate-600 hover:text-emerald-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Dashboard
          </Link>
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Treasury Admin</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-50">Treasury Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">Live fee distribution overview · auto-refreshes every 5s</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="card-elevated bg-gradient-to-br from-emerald-600 to-emerald-700 border-0 text-white">
            <div className="text-sm font-medium text-emerald-100 mb-1">Total Fees Collected</div>
            <div className="text-3xl font-bold">{formatSOL(totalCollected)} SOL</div>
            <div className="text-xs text-emerald-200 mt-1">all-time</div>
          </div>
          <div className="card-elevated">
            <div className="text-sm font-medium text-slate-500 mb-1">Treasury Balance (50%)</div>
            <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{formatSOL(treasuryBalance)} SOL</div>
          </div>
          <div className="card-elevated">
            <div className="text-sm font-medium text-slate-500 mb-1">Liquidity Balance (30%)</div>
            <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{formatSOL(liquidityBalance)} SOL</div>
          </div>
        </div>

        {/* Distribution Bar */}
        {totalCollected > 0 && (
          <div className="card-elevated">
            <h2 className="font-semibold mb-3 text-slate-800 dark:text-slate-100">Fee Distribution</h2>
            <div className="flex rounded-full overflow-hidden h-6 mb-3">
              <div className="bg-emerald-500 flex items-center justify-center text-white text-xs font-bold" style={{ width: '50%' }}>50%</div>
              <div className="bg-blue-500 flex items-center justify-center text-white text-xs font-bold" style={{ width: '30%' }}>30%</div>
              <div className="bg-amber-500 flex items-center justify-center text-white text-xs font-bold" style={{ width: '20%' }}>20%</div>
            </div>
            <div className="flex gap-4 text-sm flex-wrap">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" /> Treasury ({formatSOL(treasuryBalance)} SOL)</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-500 inline-block" /> Liquidity ({formatSOL(liquidityBalance)} SOL)</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-amber-500 inline-block" /> Creators ({formatSOL(creatorBalance)} SOL)</span>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Deposit Fee Records', value: depositFees.length },
            { label: 'Claim Fee Records', value: claimFees.length },
            { label: 'Total Records', value: feeRecords.length },
            { label: 'Creator Distributed', value: `${formatSOL(creatorBalance)} SOL` },
          ].map(({ label, value }) => (
            <div key={label} className="card text-center">
              <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{value}</div>
              <div className="text-xs text-slate-400 mt-1">{label}</div>
            </div>
          ))}
        </div>

        {/* Recent Fee Records */}
        <div className="card-elevated">
          <h2 className="font-semibold mb-4 text-slate-800 dark:text-slate-100">Recent Fee Records</h2>
          {feeRecords.length === 0 ? (
            <div className="text-center py-8 text-slate-400">No fee records yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-200 dark:border-slate-700">
                    <th className="pb-2 pr-4">Type</th>
                    <th className="pb-2 pr-4">Fee Charged</th>
                    <th className="pb-2 pr-4">Treasury</th>
                    <th className="pb-2 pr-4">Liquidity</th>
                    <th className="pb-2 pr-4">Creator</th>
                    <th className="pb-2">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {feeRecords.map((r: any) => (
                    <tr key={r.id}>
                      <td className="py-2 pr-4">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${r.fee_type === 'deposit' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                          {r.fee_type}
                        </span>
                      </td>
                      <td className="py-2 pr-4 font-medium">{formatSOL(r.amount_charged)} SOL</td>
                      <td className="py-2 pr-4 text-slate-500">{formatSOL(r.treasury_amount)}</td>
                      <td className="py-2 pr-4 text-slate-500">{formatSOL(r.liquidity_amount)}</td>
                      <td className="py-2 pr-4 text-slate-500">{formatSOL(r.creator_amount)}</td>
                      <td className="py-2 text-slate-400 text-xs">{new Date(r.created_at).toLocaleDateString('id-ID')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
