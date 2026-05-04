'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useWallet } from './providers/WalletProvider';
import { shortenAddress } from './lib/solana';

const features = [
  { emoji: '🌊', title: 'Marinade Native Staking', desc: 'Your SOL delegated to 100+ top validators — auto-rebalanced, no slashing risk.' },
  { emoji: '👥', title: 'Group Accountability', desc: 'Save with friends. Peer pressure and leaderboards keep everyone consistent.' },
  { emoji: '💰', title: '~7-8% APY', desc: 'Auto-compounding staking rewards, beating most savings accounts by 10-20x.' },
  { emoji: '🔐', title: 'Full Custody', desc: 'You always hold withdrawal authority. No smart contract holds your SOL.' },
  { emoji: '⚡', title: 'Flexible Withdrawal', desc: 'Delayed unstake (free) or instant unstake with a small fee — your choice.' },
  { emoji: '🏆', title: 'Achievements & Streaks', desc: 'Badges, leaderboards, and streak tracking make saving genuinely fun.' },
];

const steps = [
  { num: '01', icon: '🎯', title: 'Create a Group', desc: 'Set a savings target, monthly SOL amount, and duration.' },
  { num: '02', icon: '🤝', title: 'Invite Friends', desc: 'Share your group link. Friends join with their Phantom wallet.' },
  { num: '03', icon: '🌊', title: 'Stake Monthly', desc: 'Deposit SOL → Marinade Native stakes to 100+ validators automatically.' },
  { num: '04', icon: '🚀', title: 'Watch It Grow', desc: '~7-8% APY compounds in your stake accounts. Withdraw anytime.' },
];

export default function LandingPage() {
  const { isConnected, walletAddress, connect, disconnect, isLoading } = useWallet();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[var(--bg)] relative overflow-hidden">
      {/* Background blobs */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-emerald-200/30 blur-3xl animate-blob" />
        <div className="absolute top-[20%] right-[-5%] w-[500px] h-[500px] rounded-full bg-orange-200/20 blur-3xl animate-blob" style={{ animationDelay: '2s' }} />
        <div className="absolute bottom-[-10%] left-[30%] w-[400px] h-[400px] rounded-full bg-blue-200/20 blur-3xl animate-blob" style={{ animationDelay: '4s' }} />
      </div>

      {/* Nav */}
      <nav className="sticky top-0 z-50 glass border-b border-slate-200 dark:border-slate-700/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2 group">
            <span className="text-2xl group-hover:animate-bounce">🪜</span>
            <span className="font-display font-bold text-xl text-slate-800 dark:text-slate-100">Savings<span className="gradient-text">Ladder</span></span>
          </Link>
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm font-medium text-slate-600 hover:text-emerald-600 transition-colors">Features</a>
            <a href="#how-it-works" className="text-sm font-medium text-slate-600 hover:text-emerald-600 transition-colors">How it Works</a>
            {isConnected ? (
              <div className="flex items-center gap-3">
                <Link href="/dashboard" className="btn-primary text-sm !px-4 !py-2">Dashboard</Link>
                <button onClick={disconnect} className="btn-ghost text-sm">{shortenAddress(walletAddress || '')}</button>
              </div>
            ) : (
              <button id="connect-wallet-btn" onClick={connect} disabled={isLoading} className="btn-primary text-sm !px-4 !py-2">
                {isLoading ? 'Connecting…' : 'Connect Wallet'}
              </button>
            )}
          </div>
          <button className="md:hidden p-2" onClick={() => setMenuOpen(!menuOpen)}>
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={menuOpen ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'} /></svg>
          </button>
        </div>
        {menuOpen && (
          <div className="md:hidden py-4 px-4 border-t border-slate-200 animate-slide-down flex flex-col gap-3">
            <a href="#features" className="text-sm font-medium text-slate-600">Features</a>
            <a href="#how-it-works" className="text-sm font-medium text-slate-600">How it Works</a>
            {isConnected ? <Link href="/dashboard" className="btn-primary text-sm text-center">Dashboard</Link>
              : <button onClick={connect} className="btn-primary text-sm">{isLoading ? 'Connecting…' : 'Connect Wallet'}</button>}
          </div>
        )}
      </nav>

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-24 md:pt-32 md:pb-36 text-center">
        <div className="max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-full px-4 py-1.5 mb-8 animate-fade-scale">
            <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
            <span className="text-sm font-medium text-orange-700">🌊 Powered by Marinade Native Staking · Built on Solana</span>
          </div>
          <h1 className="font-display text-5xl md:text-7xl font-bold text-slate-900 dark:text-slate-50 mb-6 animate-slide-up leading-tight">
            Save Together,<br /><span className="gradient-text">Earn Together</span>
          </h1>
          <p className="text-lg md:text-xl text-slate-600 dark:text-slate-300 max-w-2xl mx-auto mb-6 animate-slide-up" style={{ animationDelay: '0.15s' }}>
            Group savings on Solana with <strong>~7-8% APY</strong> from Marinade Native staking. Your SOL auto-delegated to 100+ top validators. You keep full custody — withdraw anytime.
          </p>
          <div className="flex flex-wrap justify-center gap-3 mb-10 animate-slide-up" style={{ animationDelay: '0.2s' }}>
            {['No smart contract risk', 'Full custody', 'Auto-rebalancing', '100+ validators'].map(f => (
              <span key={f} className="text-xs font-medium bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full">✓ {f}</span>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-slide-up" style={{ animationDelay: '0.3s' }}>
            {isConnected
              ? <Link href="/dashboard" className="btn-primary text-lg !px-8 !py-4 animate-pulse-glow">Go to Dashboard →</Link>
              : <button id="hero-connect-btn" onClick={connect} disabled={isLoading} className="btn-primary text-lg !px-8 !py-4 animate-pulse-glow">{isLoading ? 'Connecting…' : 'Start Saving — Free'}</button>}
            <a href="#how-it-works" className="btn-outline text-lg !px-8 !py-4">See How it Works</a>
          </div>
        </div>
      </section>

      {/* Marinade Banner */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <div className="card-elevated bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 !p-8">
          <div className="flex flex-col md:flex-row items-center gap-6">
            <div className="text-5xl">🌊</div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-slate-800 mb-2">Why Marinade Native Staking?</h2>
              <p className="text-slate-600 text-sm leading-relaxed">
                Unlike liquid staking (mSOL), Marinade Native creates <strong>native stake accounts directly in your wallet</strong>. No third-party smart contract holds your SOL. Marinade&apos;s bot handles validator selection and rebalancing across 100+ high-performing validators — you just collect the rewards.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4 text-center shrink-0">
              {[['~7-8%', 'APY'], ['100+', 'Validators'], ['0', 'Custody Risk'], ['24/7', 'Auto-Rebalance']].map(([v, l]) => (
                <div key={l} className="bg-white rounded-xl p-3 border border-orange-100">
                  <div className="text-xl font-bold text-orange-600">{v}</div>
                  <div className="text-xs text-slate-500">{l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-16">
          <span className="badge-success text-sm">Features</span>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-900 dark:text-slate-50 mt-4">Everything You Need to <span className="gradient-text">Save Smarter</span></h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <div key={f.title} className="card-elevated group cursor-default animate-fade-scale" style={{ animationDelay: `${i * 0.1}s` }}>
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition-transform">{f.emoji}</div>
              <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">{f.title}</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-16">
          <span className="badge-info text-sm">How It Works</span>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-900 dark:text-slate-50 mt-4">Start Saving in <span className="gradient-text">4 Simple Steps</span></h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((s, i) => (
            <div key={s.num} className="card text-center animate-fade-scale" style={{ animationDelay: `${i * 0.15}s` }}>
              <div className="text-4xl mb-4">{s.icon}</div>
              <span className="text-xs font-bold text-emerald-600 tracking-wider uppercase">Step {s.num}</span>
              <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mt-2 mb-2">{s.title}</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
        <div className="card-elevated !p-12 bg-gradient-to-br from-emerald-600 to-emerald-700 border-0 text-white">
          <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">Ready to Save Smarter?</h2>
          <p className="text-emerald-100 max-w-md mx-auto mb-8">Join savers earning ~7-8% APY via Marinade Native staking on Solana.</p>
          {isConnected
            ? <Link href="/dashboard" className="inline-block bg-white text-emerald-700 font-bold px-8 py-4 rounded-xl hover:bg-emerald-50 transition-all">Go to Dashboard →</Link>
            : <button onClick={connect} className="bg-white text-emerald-700 font-bold px-8 py-4 rounded-xl hover:bg-emerald-50 transition-all">Connect Wallet &amp; Start Saving</button>}
        </div>
      </section>

      <footer className="border-t border-slate-200 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2"><span className="text-xl">🪜</span><span className="font-display font-bold text-slate-800">SavingsLadder</span></div>
          <p className="text-sm text-slate-400">© 2025 SavingsLadder · Powered by Marinade Native Staking · Built on Solana</p>
        </div>
      </footer>
    </div>
  );
}
