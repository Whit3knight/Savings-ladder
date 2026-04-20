import type { Metadata } from 'next';
import './globals.css';
import { WalletProvider } from './providers/WalletProvider';

import { ThemeProvider } from './providers/ThemeProvider';

export const metadata: Metadata = {
  title: 'SavingsLadder — Save Together, Earn Together',
  description: 'Group savings on Solana blockchain. Save with friends, earn 5% APY interest, unlock fair microloans.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="scroll-smooth">
      <body>
        <ThemeProvider>
          <WalletProvider>{children}</WalletProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
