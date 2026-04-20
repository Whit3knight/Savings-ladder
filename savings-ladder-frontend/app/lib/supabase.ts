import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function getOrCreateUser(walletAddress: string) {
  const { data: existing } = await supabase.from('users').select('*').eq('wallet_address', walletAddress).single();
  if (existing) return existing;
  const { data: newUser, error } = await supabase.from('users').insert({ wallet_address: walletAddress }).select().single();
  if (error) throw error;
  return newUser;
}

export async function getUserGroups(userId: string) {
  const { data, error } = await supabase.from('group_members').select('*, group:groups(*)').eq('user_id', userId).eq('is_active', true);
  if (error) throw error;
  return data;
}

export async function getGroupDetails(groupId: string) {
  const { data, error } = await supabase.from('groups').select(`*, creator:users!creator_id(wallet_address, username, avatar_emoji), members:group_members(*, user:users(wallet_address, username, avatar_emoji))`).eq('id', groupId).single();
  if (error) throw error;
  return data;
}

export async function getGroupDeposits(groupId: string) {
  const { data, error } = await supabase.from('deposits').select(`*, member:group_members(user:users(wallet_address, username, avatar_emoji))`).eq('group_id', groupId).order('created_at', { ascending: false }).limit(50);
  if (error) throw error;
  return data;
}

export async function getLeaderboard(groupId: string) {
  const { data, error } = await supabase.from('leaderboard').select('*').eq('group_id', groupId).order('rank', { ascending: true });
  if (error) throw error;
  return data;
}

export async function getUserLoans(userId: string) {
  const { data, error } = await supabase.from('microloans').select(`*, group:groups(name, emoji), member:group_members!inner(user_id)`).eq('member.user_id', userId).order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getUserAchievements(userId: string) {
  const { data, error } = await supabase.from('achievements').select('*').eq('user_id', userId).order('earned_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function saveGroup(groupData: {
  group_pubkey: string; creator_id: string; name: string; emoji: string;
  description?: string; target_amount: number; monthly_contribution: number;
  duration_months: number; max_members: number;
}) {
  const { data, error } = await supabase.from('groups').insert(groupData).select().single();
  if (error) throw error;
  return data;
}

export async function saveDeposit(depositData: {
  group_id: string; member_id: string; amount: number; tx_hash: string;
}) {
  const { data, error } = await supabase.from('deposits').insert({ ...depositData, status: 'confirmed' }).select().single();
  if (error) throw error;
  return data;
}
