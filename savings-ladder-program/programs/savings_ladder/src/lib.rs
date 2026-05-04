use anchor_lang::prelude::*;

declare_id!("FdjoGvS6LpXJGL5rDP6rteg2ethHwbsxWeZ2P1PfQY8E");

pub const MAX_NAME_LEN: usize = 50;
pub const MAX_STAKE_ACCOUNTS: usize = 50;

#[program]
pub mod savings_ladder {
    use super::*;

    /// Create a new group savings ledger (no vault — SOL stays in user's stake accounts)
    pub fn create_group(
        ctx: Context<CreateGroup>,
        name: String,
        target_amount: u64,
        monthly_contribution: u64,
        duration_months: u32,
        max_members: u32,
    ) -> Result<()> {
        require!(name.len() > 0 && name.len() <= MAX_NAME_LEN, SavingsError::NameTooLong);
        require!(target_amount > 0, SavingsError::InvalidAmount);
        require!(monthly_contribution > 0, SavingsError::InvalidAmount);
        require!(duration_months >= 1 && duration_months <= 36, SavingsError::InvalidDuration);
        require!(max_members >= 2 && max_members <= 50, SavingsError::InvalidMaxMembers);

        let group = &mut ctx.accounts.group;
        group.authority = ctx.accounts.authority.key();
        group.name = name.clone();
        group.target_amount = target_amount;
        group.monthly_contribution = monthly_contribution;
        group.duration_months = duration_months;
        group.max_members = max_members;
        group.total_members = 0;
        group.total_staked = 0;
        group.total_rewards = 0;
        group.is_active = true;
        group.created_at = Clock::get()?.unix_timestamp;
        group.bump = ctx.bumps.group;

        emit!(GroupCreatedEvent {
            group: group.key(),
            authority: ctx.accounts.authority.key(),
            name,
            target_amount,
        });

        Ok(())
    }

    /// Join an existing group; creates Member PDA for this user
    pub fn join_group(ctx: Context<JoinGroup>) -> Result<()> {
        let group = &mut ctx.accounts.group;
        require!(group.is_active, SavingsError::GroupInactive);
        require!(group.total_members < group.max_members, SavingsError::GroupFull);

        group.total_members = group.total_members.checked_add(1).ok_or(SavingsError::Overflow)?;

        let member = &mut ctx.accounts.member;
        member.group = group.key();
        member.authority = ctx.accounts.authority.key();
        member.total_deposited = 0;
        member.deposit_count = 0;
        member.streak_count = 0;
        member.stake_accounts = vec![];
        member.join_date = Clock::get()?.unix_timestamp;
        member.is_active = true;
        member.bump = ctx.bumps.member;

        emit!(GroupJoinedEvent {
            group: group.key(),
            member: ctx.accounts.authority.key(),
            total_members: group.total_members,
        });

        Ok(())
    }

    /// Record that a deposit (native stake) has occurred; called AFTER frontend SDK staking.
    /// Adds the new stake_account pubkey to the member's tracked list.
    pub fn record_deposit(
        ctx: Context<RecordDeposit>,
        amount_lamports: u64,
        stake_account: Pubkey,
    ) -> Result<()> {
        require!(amount_lamports > 0, SavingsError::InvalidAmount);

        let member = &mut ctx.accounts.member;
        let group = &mut ctx.accounts.group;

        require!(group.is_active, SavingsError::GroupInactive);
        require!(member.is_active, SavingsError::MemberInactive);
        require!(
            member.stake_accounts.len() < MAX_STAKE_ACCOUNTS,
            SavingsError::TooManyStakeAccounts
        );

        member.stake_accounts.push(stake_account);
        member.total_deposited = member
            .total_deposited
            .checked_add(amount_lamports)
            .ok_or(SavingsError::Overflow)?;
        member.deposit_count = member
            .deposit_count
            .checked_add(1)
            .ok_or(SavingsError::Overflow)?;

        // Simple streak: increment (full streak logic is off-chain in Supabase)
        member.streak_count = member
            .streak_count
            .checked_add(1)
            .ok_or(SavingsError::Overflow)?;

        group.total_staked = group
            .total_staked
            .checked_add(amount_lamports)
            .ok_or(SavingsError::Overflow)?;

        emit!(DepositRecordedEvent {
            group: group.key(),
            member: ctx.accounts.authority.key(),
            amount_lamports,
            stake_account,
            deposit_count: member.deposit_count,
        });

        Ok(())
    }

    /// Record a withdrawal; removes stake_account from member's list.
    pub fn record_withdrawal(
        ctx: Context<RecordWithdrawal>,
        amount_lamports: u64,
        stake_account: Pubkey,
    ) -> Result<()> {
        require!(amount_lamports > 0, SavingsError::InvalidAmount);

        let member = &mut ctx.accounts.member;
        let group = &mut ctx.accounts.group;

        require!(group.is_active, SavingsError::GroupInactive);
        require!(member.is_active, SavingsError::MemberInactive);
        require!(
            member.total_deposited >= amount_lamports,
            SavingsError::InsufficientBalance
        );

        // Remove the stake account from the tracked list
        member.stake_accounts.retain(|&pk| pk != stake_account);

        member.total_deposited = member
            .total_deposited
            .checked_sub(amount_lamports)
            .ok_or(SavingsError::Overflow)?;

        group.total_staked = group
            .total_staked
            .saturating_sub(amount_lamports);

        emit!(WithdrawalRecordedEvent {
            group: group.key(),
            member: ctx.accounts.authority.key(),
            amount_lamports,
            stake_account,
        });

        Ok(())
    }

    /// Authority-only: record staking rewards distributed to this group
    pub fn distribute_rewards(ctx: Context<DistributeRewards>, amount: u64) -> Result<()> {
        require!(amount > 0, SavingsError::InvalidAmount);

        let group = &mut ctx.accounts.group;
        require!(group.is_active, SavingsError::GroupInactive);
        require!(
            group.authority == ctx.accounts.authority.key(),
            SavingsError::Unauthorized
        );
        require!(group.total_members > 0, SavingsError::NoMembers);

        group.total_rewards = group
            .total_rewards
            .checked_add(amount)
            .ok_or(SavingsError::Overflow)?;

        emit!(RewardsDistributedEvent {
            group: group.key(),
            amount,
            total_rewards: group.total_rewards,
        });

        Ok(())
    }

    /// Authority-only: deactivate the group
    pub fn close_group(ctx: Context<CloseGroup>) -> Result<()> {
        let group = &mut ctx.accounts.group;
        require!(
            group.authority == ctx.accounts.authority.key(),
            SavingsError::Unauthorized
        );
        require!(group.is_active, SavingsError::GroupInactive);

        group.is_active = false;

        emit!(GroupClosedEvent {
            group: group.key(),
            authority: ctx.accounts.authority.key(),
        });

        Ok(())
    }
}

// ─────────────────────────────────────────────────
// ACCOUNT STRUCTS
// ─────────────────────────────────────────────────

#[account]
pub struct Group {
    pub authority: Pubkey,          // 32
    pub name: String,               // 4 + MAX_NAME_LEN
    pub target_amount: u64,         // 8
    pub monthly_contribution: u64,  // 8
    pub duration_months: u32,       // 4
    pub max_members: u32,           // 4
    pub total_members: u32,         // 4
    pub total_staked: u64,          // 8  (lamports tracked by members)
    pub total_rewards: u64,         // 8  (rewards recorded by authority)
    pub is_active: bool,            // 1
    pub created_at: i64,            // 8
    pub bump: u8,                   // 1
}

impl Group {
    pub const SPACE: usize = 8 + 32 + (4 + MAX_NAME_LEN) + 8 + 8 + 4 + 4 + 4 + 8 + 8 + 1 + 8 + 1 + 64;
}

#[account]
pub struct Member {
    pub group: Pubkey,              // 32
    pub authority: Pubkey,          // 32
    pub total_deposited: u64,       // 8
    pub deposit_count: u32,         // 4
    pub streak_count: u32,          // 4
    pub stake_accounts: Vec<Pubkey>, // 4 + n*32 (dynamic, grown via realloc)
    pub join_date: i64,             // 8
    pub is_active: bool,            // 1
    pub bump: u8,                   // 1
}

impl Member {
    /// Compute required account space for n stake accounts
    pub fn space(n: usize) -> usize {
        8      // discriminator
        + 32   // group
        + 32   // authority
        + 8    // total_deposited
        + 4    // deposit_count
        + 4    // streak_count
        + 4 + n * 32  // stake_accounts vec (4 = length prefix)
        + 8    // join_date
        + 1    // is_active
        + 1    // bump
    }
}

// ─────────────────────────────────────────────────
// INSTRUCTION CONTEXTS
// ─────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(name: String)]
pub struct CreateGroup<'info> {
    #[account(
        init,
        payer = authority,
        space = Group::SPACE,
        seeds = [b"group", authority.key().as_ref(), name.as_bytes()],
        bump,
    )]
    pub group: Account<'info, Group>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct JoinGroup<'info> {
    #[account(
        mut,
        constraint = group.is_active @ SavingsError::GroupInactive,
        constraint = group.total_members < group.max_members @ SavingsError::GroupFull,
    )]
    pub group: Account<'info, Group>,

    #[account(
        init,
        payer = authority,
        space = Member::space(0),
        seeds = [b"member", group.key().as_ref(), authority.key().as_ref()],
        bump,
    )]
    pub member: Account<'info, Member>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RecordDeposit<'info> {
    #[account(mut)]
    pub group: Account<'info, Group>,

    #[account(
        mut,
        seeds = [b"member", group.key().as_ref(), authority.key().as_ref()],
        bump = member.bump,
        realloc = Member::space(member.stake_accounts.len() + 1),
        realloc::payer = authority,
        realloc::zero = false,
    )]
    pub member: Account<'info, Member>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RecordWithdrawal<'info> {
    #[account(mut)]
    pub group: Account<'info, Group>,

    #[account(
        mut,
        seeds = [b"member", group.key().as_ref(), authority.key().as_ref()],
        bump = member.bump,
    )]
    pub member: Account<'info, Member>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DistributeRewards<'info> {
    #[account(mut)]
    pub group: Account<'info, Group>,

    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct CloseGroup<'info> {
    #[account(mut)]
    pub group: Account<'info, Group>,

    pub authority: Signer<'info>,
}

// ─────────────────────────────────────────────────
// ERRORS
// ─────────────────────────────────────────────────

#[error_code]
pub enum SavingsError {
    #[msg("Name must be 1-50 characters")]
    NameTooLong,
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Duration must be 1-36 months")]
    InvalidDuration,
    #[msg("Max members must be 2-50")]
    InvalidMaxMembers,
    #[msg("Group is not active")]
    GroupInactive,
    #[msg("Group has reached maximum capacity")]
    GroupFull,
    #[msg("Member is not active")]
    MemberInactive,
    #[msg("Cannot distribute rewards with no members")]
    NoMembers,
    #[msg("Insufficient staked balance")]
    InsufficientBalance,
    #[msg("Too many stake accounts (max 50)")]
    TooManyStakeAccounts,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Unauthorized")]
    Unauthorized,
}

// ─────────────────────────────────────────────────
// EVENTS
// ─────────────────────────────────────────────────

#[event]
pub struct GroupCreatedEvent {
    pub group: Pubkey,
    pub authority: Pubkey,
    pub name: String,
    pub target_amount: u64,
}

#[event]
pub struct GroupJoinedEvent {
    pub group: Pubkey,
    pub member: Pubkey,
    pub total_members: u32,
}

#[event]
pub struct DepositRecordedEvent {
    pub group: Pubkey,
    pub member: Pubkey,
    pub amount_lamports: u64,
    pub stake_account: Pubkey,
    pub deposit_count: u32,
}

#[event]
pub struct WithdrawalRecordedEvent {
    pub group: Pubkey,
    pub member: Pubkey,
    pub amount_lamports: u64,
    pub stake_account: Pubkey,
}

#[event]
pub struct RewardsDistributedEvent {
    pub group: Pubkey,
    pub amount: u64,
    pub total_rewards: u64,
}

#[event]
pub struct GroupClosedEvent {
    pub group: Pubkey,
    pub authority: Pubkey,
}
