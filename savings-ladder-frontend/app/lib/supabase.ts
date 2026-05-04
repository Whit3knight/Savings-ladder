import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ─── Users ────────────────────────────────────────────────────────

export async function getOrCreateUser(walletAddress: string) {
  const { data: existing } = await supabase
    .from('users')
    .select('*')
    .eq('wallet_address', walletAddress)
    .single();
  if (existing) return existing;

  const { data: newUser, error } = await supabase
    .from('users')
    .insert({ wallet_address: walletAddress, avatar_emoji: '👤' })
    .select()
    .single();
  if (error) throw error;
  return newUser;
}

// ─── Groups ───────────────────────────────────────────────────────

export async function saveGroup(groupData: {
  group_pubkey: string;
  creator_id: string;
  name: string;
  emoji: string;
  description?: string;
  target_amount: number;
  monthly_contribution: number;
  duration_months: number;
  max_members: number;
}) {
  const { data, error } = await supabase.from('groups').insert(groupData).select().single();
  if (error) throw error;
  return data;
}

export async function getGroupDetails(groupId: string) {
  const { data, error } = await supabase
    .from('groups')
    .select(
      `*, creator:users!groups_creator_id_fkey(wallet_address, username, avatar_emoji),
       members:group_members(*, user:users!group_members_user_id_fkey(wallet_address, username, avatar_emoji))`
    )
    .eq('id', groupId)
    .single();
  // Return null instead of throwing so the page shows "Group Not Found" cleanly
  if (error) return null;
  return data;
}

export async function getUserGroups(userId: string) {
  const { data, error } = await supabase
    .from('group_members')
    .select('*, group:groups(*)')
    .eq('user_id', userId)
    .eq('is_active', true);
  if (error) throw error;
  return data;
}

/** Fetch all groups where the user is the creator (for dashboard display). */
export async function getCreatorGroups(userId: string) {
  const { data, error } = await supabase
    .from('groups')
    .select('*')
    .eq('creator_id', userId)
    .order('created_at', { ascending: false });
  if (error) return []; // non-fatal
  return data || [];
}

export async function getGroupByInviteCode(inviteCode: string) {
  const { data, error } = await supabase
    .from('groups')
    .select('*')
    .eq('invite_code', inviteCode)
    .single();
  if (error) return null;
  return data;
}

// ─── Members ──────────────────────────────────────────────────────

export async function saveMember(memberData: {
  group_id: string;
  user_id: string;
  member_pubkey: string;
}) {
  const { data, error } = await supabase.from('group_members').insert(memberData).select().single();
  if (error) throw error;

  // Re-count active members and sync the group's total_members field (best-effort)
  const { count } = await supabase
    .from('group_members')
    .select('id', { count: 'exact', head: true })
    .eq('group_id', memberData.group_id)
    .eq('is_active', true);
  if (count !== null) {
    await supabase.from('groups').update({ total_members: count }).eq('id', memberData.group_id);
  }

  return data;
}

export async function getLeaderboard(groupId: string) {
  const { data, error } = await supabase
    .from('leaderboard')
    .select('*')
    .eq('group_id', groupId)
    .order('rank', { ascending: true });
  if (error) throw error;
  return data;
}

// ─── Deposits ─────────────────────────────────────────────────────

export async function saveDeposit(depositData: {
  group_id: string;
  member_id: string;
  amount_lamports: number;
  stake_account_pubkey: string;
  tx_hash: string;
  epoch_at_deposit?: number;
}) {
  const { data, error } = await supabase
    .from('deposits')
    .insert({ ...depositData, status: 'confirmed' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getGroupDeposits(groupId: string) {
  const { data, error } = await supabase
    .from('deposits')
    .select(`*, member:group_members(user:users(wallet_address, username, avatar_emoji))`)
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data;
}

// ─── Withdrawals ──────────────────────────────────────────────────

export async function saveWithdrawal(withdrawalData: {
  group_id: string;
  member_id: string;
  amount_lamports: number;
  tx_hash: string;
  withdraw_type: 'instant' | 'delayed';
  fee_paid?: number;
  stake_account_pubkey?: string;
}) {
  const { data, error } = await supabase
    .from('withdrawals')
    .insert({ ...withdrawalData, status: 'confirmed' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getGroupWithdrawals(groupId: string) {
  const { data, error } = await supabase
    .from('withdrawals')
    .select(`*, member:group_members(user:users(wallet_address, username, avatar_emoji))`)
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data;
}

// ─── Achievements ─────────────────────────────────────────────────

export async function getUserAchievements(userId: string) {
  const { data, error } = await supabase
    .from('achievements')
    .select('*')
    .eq('user_id', userId)
    .order('earned_at', { ascending: false });
  if (error) throw error;
  return data;
}

// ─── Stats ────────────────────────────────────────────────────────

/** Update group total_staked after a deposit/withdrawal */
export async function updateGroupStaked(groupId: string, totalStakedLamports: number) {
  const { error } = await supabase
    .from('groups')
    .update({ total_staked: totalStakedLamports, updated_at: new Date().toISOString() })
    .eq('id', groupId);
  if (error) throw error;
}

/** Update member's total_deposited and deposit_count */
export async function updateMemberStats(
  memberId: string,
  totalDepositedLamports: number,
  depositCount: number,
  streakCount?: number
) {
  const updates: any = {
    total_deposited: totalDepositedLamports,
    deposit_count: depositCount,
    last_deposit_at: new Date().toISOString(),
  };
  if (streakCount !== undefined) updates.streak_count = streakCount;

  const { error } = await supabase.from('group_members').update(updates).eq('id', memberId);
  if (error) throw error;
}
