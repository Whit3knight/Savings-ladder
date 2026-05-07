export const DEPOSIT_FEE_BPS = 100;
export const CLAIM_FEE_BPS = 300;
export const BPS_DIVISOR = 10_000;

export const TREASURY_BPS = 5000;
export const LIQUIDITY_BPS = 3000;
export const CREATOR_BPS = 2000;

export interface FeeBreakdown {
  totalFee: number;
  treasury: number;
  liquidity: number;
  creator: number;
}

export function calculateDepositFee(amount: number): FeeBreakdown {
  const totalFee = Math.floor((amount * DEPOSIT_FEE_BPS) / BPS_DIVISOR);
  return distributeFee(totalFee);
}

export function calculateClaimFee(amount: number): FeeBreakdown {
  const totalFee = Math.floor((amount * CLAIM_FEE_BPS) / BPS_DIVISOR);
  return distributeFee(totalFee);
}

function distributeFee(fee: number): FeeBreakdown {
  const treasury = Math.floor((fee * TREASURY_BPS) / BPS_DIVISOR);
  const liquidity = Math.floor((fee * LIQUIDITY_BPS) / BPS_DIVISOR);
  const creator = fee - treasury - liquidity;
  return { totalFee: fee, treasury, liquidity, creator };
}

export function formatSOL(lamports: number): string {
  return (lamports / 1_000_000_000).toFixed(4);
}
