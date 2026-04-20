'use client';
import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { PublicKey, Transaction } from '@solana/web3.js';

export interface WalletContextType {
  isConnected: boolean; walletAddress: string | null; publicKey: PublicKey | null;
  connect: () => Promise<void>; disconnect: () => Promise<void>;
  signTransaction: (tx: Transaction) => Promise<Transaction>;
  isLoading: boolean; error: string | null;
}

const WalletContext = createContext<WalletContextType>({
  isConnected: false, walletAddress: null, publicKey: null,
  connect: async () => {}, disconnect: async () => {},
  signTransaction: async (tx) => tx, isLoading: false, error: null,
});

export const useWallet = () => useContext(WalletContext);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [publicKey, setPublicKey] = useState<PublicKey | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getPhantom = useCallback(() => {
    if (typeof window !== 'undefined') {
      const phantom = (window as any)?.solana;
      if (phantom?.isPhantom) return phantom;
    }
    return null;
  }, []);

  useEffect(() => {
    const phantom = getPhantom();
    if (phantom) {
      phantom.connect({ onlyIfTrusted: true }).then((resp: any) => {
        setPublicKey(resp.publicKey); setWalletAddress(resp.publicKey.toString()); setIsConnected(true);
      }).catch(() => {});
      phantom.on('disconnect', () => { setIsConnected(false); setWalletAddress(null); setPublicKey(null); });
      phantom.on('accountChanged', (pk: PublicKey | null) => {
        if (pk) { setPublicKey(pk); setWalletAddress(pk.toString()); }
        else { setIsConnected(false); setWalletAddress(null); setPublicKey(null); }
      });
    }
  }, [getPhantom]);

  const connect = useCallback(async () => {
    setIsLoading(true); setError(null);
    try {
      const phantom = getPhantom();
      if (!phantom) { window.open('https://phantom.app/', '_blank'); throw new Error('Phantom wallet not found'); }
      const resp = await phantom.connect();
      setPublicKey(resp.publicKey); setWalletAddress(resp.publicKey.toString()); setIsConnected(true);
    } catch (err: any) { setError(err.message); } finally { setIsLoading(false); }
  }, [getPhantom]);

  const disconnect = useCallback(async () => {
    try { const phantom = getPhantom(); if (phantom) await phantom.disconnect(); } catch {}
    finally { setIsConnected(false); setWalletAddress(null); setPublicKey(null); }
  }, [getPhantom]);

  const signTransaction = useCallback(async (tx: Transaction): Promise<Transaction> => {
    const phantom = getPhantom(); if (!phantom) throw new Error('Not connected'); return phantom.signTransaction(tx);
  }, [getPhantom]);

  return (
    <WalletContext.Provider value={{ isConnected, walletAddress, publicKey, connect, disconnect, signTransaction, isLoading, error }}>
      {children}
    </WalletContext.Provider>
  );
}
