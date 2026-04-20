#!/bin/bash
set -e

CLUSTER=${1:-devnet}
echo "🪜 SavingsLadder Deployment - Target: $CLUSTER"
echo "═══════════════════════════════════════════════════"

echo "📋 Checking prerequisites..."
command -v solana >/dev/null 2>&1 || { echo "❌ Solana CLI required"; exit 1; }
command -v anchor >/dev/null 2>&1 || { echo "❌ Anchor CLI required"; exit 1; }

echo "  Solana: $(solana --version)"
echo "  Anchor: $(anchor --version)"

solana config set --url $CLUSTER

echo ""
echo "💰 Wallet: $(solana address)"
echo "   Balance: $(solana balance)"

if [ "$CLUSTER" = "devnet" ]; then
    BALANCE=$(solana balance | awk '{print $1}')
    if (( $(echo "$BALANCE < 2" | bc -l) )); then
        echo "⚠️  Low balance, requesting airdrop..."
        solana airdrop 2
        sleep 5
    fi
fi

echo ""
echo "🔨 Building..."
anchor build

echo ""
echo "🔄 Syncing program keys..."
anchor keys sync

echo ""
echo "🔨 Rebuilding with synced keys..."
anchor build

echo ""
echo "🚀 Deploying to $CLUSTER..."
anchor deploy --provider.cluster $CLUSTER

PROGRAM_ID=$(solana-keygen pubkey target/deploy/savings_ladder-keypair.json 2>/dev/null || echo "unknown")

echo ""
echo "═══════════════════════════════════════════════════"
echo "✅ DEPLOYMENT SUCCESSFUL!"
echo "   Program ID: $PROGRAM_ID"
echo "   Cluster:    $CLUSTER"
echo "   Explorer:   https://explorer.solana.com/address/$PROGRAM_ID?cluster=$CLUSTER"
echo ""
echo "📋 Next: set NEXT_PUBLIC_PROGRAM_ID=$PROGRAM_ID in frontend .env.local"
