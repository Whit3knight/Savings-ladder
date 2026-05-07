use anchor_lang::prelude::*;

declare_id!("FdjoGvS6LpXJGL5rDP6rteg2ethHwbsxWeZ2P1PfQY8E");

pub const MAX_NAME_LEN: usize = 50;
pub const MAX_STAKE_ACCOUNTS: usize = 50;

pub const DEPOSIT_FEE_BPS: u64 = 100;
pub const REWARD_CLAIM_FEE_BPS: u64 = 300;
pub const BPS_DIVISOR: u64 = 10_000;
pub const TREASURY_BPS: u64 = 5000;
pub const LIQUIDITY_BPS: u64 = 3000;
pub const CREATOR_BPS: u64 = 2000;

fn calculate_fee(amount: u64, fee_bps: u64) -> Result<u64> {
    let product = amount
        .checked_mul(fee_bps)
        .ok_or(error!(SavingsError::Overflow))?;
    product
        .checked_div(BPS_DIVISOR)
        .ok_or(error!(SavingsError::Overflow))
}

fn distribute_fee(fee: u64) -> Result<(u64, u64, u64)> {
    let treasury = calculate_fee(fee, TREASURY_BPS)?;
    let liquidity = calculate_fee(fee, LIQUIDITY_BPS)?;
    let creator = fee
        .checked_sub(treasury + liquidity)
        .ok_or(error!(SavingsError::Overflow))?;
    Ok((treasury, liquidity, creator))
}

#[program]
pub mod savings_ladder {
    use super::*;

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
        member.total_fees_paid = 0;
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

        member.stake_accounts.retain(|&pk| pk != stake_account);
        member.total_deposited = member
            .total_deposited
            .checked_sub(amount_lamports)
            .ok_or(SavingsError::Overflow)?;

        group.total_staked = group.total_staked.saturating_sub(amount_lamports);

        emit!(WithdrawalRecordedEvent {
            group: group.key(),
            member: ctx.accounts.authority.key(),
            amount_lamports,
            stake_account,
        });

        Ok(())
    }

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

    pub fn initialize_treasury(ctx: Context<InitializeTreasury>) -> Result<()> {
        let treasury = &mut ctx.accounts.treasury;
        treasury.total_collected = 0;
        treasury.treasury_balance = 0;
        treasury.liquidity_balance = 0;
        treasury.bump = ctx.bumps.treasury;
        Ok(())
    }

    pub fn charge_deposit_fee(
        ctx: Context<ChargeDepositFee>,
        amount_lamports: u64,
        stake_account: Pubkey,
    ) -> Result<()> {
        require!(amount_lamports > 0, SavingsError::InvalidAmount);

        // Cache keys and state before any mutable borrows
        let group_key = ctx.accounts.group.key();
        let group_authority = ctx.accounts.group.authority;
        let group_is_active = ctx.accounts.group.is_active;
        let member_is_active = ctx.accounts.member.is_active;
        let stake_count = ctx.accounts.member.stake_accounts.len();
        let payer_key = ctx.accounts.payer.key();
        let creator_is_new = ctx.accounts.creator_rewards.group == Pubkey::default();

        require!(group_is_active, SavingsError::GroupInactive);
        require!(member_is_active, SavingsError::MemberInactive);
        require!(stake_count < MAX_STAKE_ACCOUNTS, SavingsError::TooManyStakeAccounts);

        let fee = calculate_fee(amount_lamports, DEPOSIT_FEE_BPS)?;
        let (treasury_cut, liquidity_cut, creator_cut) = distribute_fee(fee)?;

        require!(ctx.accounts.payer.lamports() >= fee, SavingsError::InsufficientFunds);

        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.payer.to_account_info(),
                    to: ctx.accounts.treasury.to_account_info(),
                },
            ),
            fee,
        )?;

        {
            let treasury = &mut ctx.accounts.treasury;
            treasury.total_collected = treasury
                .total_collected
                .checked_add(fee)
                .ok_or(SavingsError::Overflow)?;
            treasury.treasury_balance = treasury
                .treasury_balance
                .checked_add(treasury_cut)
                .ok_or(SavingsError::Overflow)?;
            treasury.liquidity_balance = treasury
                .liquidity_balance
                .checked_add(liquidity_cut)
                .ok_or(SavingsError::Overflow)?;
        }

        {
            let creator_rewards = &mut ctx.accounts.creator_rewards;
            if creator_is_new {
                creator_rewards.group = group_key;
                creator_rewards.creator_address = group_authority;
                creator_rewards.total_earned = 0;
                creator_rewards.claimed = 0;
                creator_rewards.bump = ctx.bumps.creator_rewards;
            }
            creator_rewards.total_earned = creator_rewards
                .total_earned
                .checked_add(creator_cut)
                .ok_or(SavingsError::Overflow)?;
        }

        {
            let member = &mut ctx.accounts.member;
            member.stake_accounts.push(stake_account);
            member.total_deposited = member
                .total_deposited
                .checked_add(amount_lamports)
                .ok_or(SavingsError::Overflow)?;
            member.deposit_count = member
                .deposit_count
                .checked_add(1)
                .ok_or(SavingsError::Overflow)?;
            member.streak_count = member
                .streak_count
                .checked_add(1)
                .ok_or(SavingsError::Overflow)?;
            member.total_fees_paid = member
                .total_fees_paid
                .checked_add(fee)
                .ok_or(SavingsError::Overflow)?;
        }

        ctx.accounts.group.total_staked = ctx
            .accounts
            .group
            .total_staked
            .checked_add(amount_lamports)
            .ok_or(SavingsError::Overflow)?;

        let total_collected = ctx.accounts.treasury.total_collected;
        let treasury_balance = ctx.accounts.treasury.treasury_balance;
        let liquidity_balance = ctx.accounts.treasury.liquidity_balance;

        emit!(FeeCollectedEvent {
            fee_type: 0,
            total_fee: fee,
            treasury_amount: treasury_cut,
            liquidity_amount: liquidity_cut,
            creator_amount: creator_cut,
            group: group_key,
            member: payer_key,
            timestamp: Clock::get()?.unix_timestamp,
        });

        emit!(TreasuryBalanceUpdated {
            total_collected,
            treasury_balance,
            liquidity_balance,
        });

        Ok(())
    }

    pub fn claim_rewards_with_fee(
        ctx: Context<ClaimRewardsWithFee>,
        reward_amount: u64,
    ) -> Result<()> {
        require!(reward_amount > 0, SavingsError::InvalidAmount);

        let group_key = ctx.accounts.group.key();
        let member_key = ctx.accounts.withdrawal_authority.key();

        let fee = calculate_fee(reward_amount, REWARD_CLAIM_FEE_BPS)?;
        let (treasury_cut, liquidity_cut, creator_cut) = distribute_fee(fee)?;

        require!(ctx.accounts.withdrawal_authority.lamports() >= fee, SavingsError::InsufficientFunds);

        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.withdrawal_authority.to_account_info(),
                    to: ctx.accounts.treasury.to_account_info(),
                },
            ),
            fee,
        )?;

        {
            let treasury = &mut ctx.accounts.treasury;
            treasury.total_collected = treasury
                .total_collected
                .checked_add(fee)
                .ok_or(SavingsError::Overflow)?;
            treasury.treasury_balance = treasury
                .treasury_balance
                .checked_add(treasury_cut)
                .ok_or(SavingsError::Overflow)?;
            treasury.liquidity_balance = treasury
                .liquidity_balance
                .checked_add(liquidity_cut)
                .ok_or(SavingsError::Overflow)?;
        }

        ctx.accounts.creator_rewards.total_earned = ctx
            .accounts
            .creator_rewards
            .total_earned
            .checked_add(creator_cut)
            .ok_or(SavingsError::Overflow)?;

        let total_collected = ctx.accounts.treasury.total_collected;
        let treasury_balance = ctx.accounts.treasury.treasury_balance;
        let liquidity_balance = ctx.accounts.treasury.liquidity_balance;

        emit!(FeeCollectedEvent {
            fee_type: 1,
            total_fee: fee,
            treasury_amount: treasury_cut,
            liquidity_amount: liquidity_cut,
            creator_amount: creator_cut,
            group: group_key,
            member: member_key,
            timestamp: Clock::get()?.unix_timestamp,
        });

        emit!(TreasuryBalanceUpdated {
            total_collected,
            treasury_balance,
            liquidity_balance,
        });

        Ok(())
    }
}

// ─────────────────────────────────────────────────
// ACCOUNT STRUCTS
// ─────────────────────────────────────────────────

#[account]
pub struct Group {
    pub authority: Pubkey,
    pub name: String,
    pub target_amount: u64,
    pub monthly_contribution: u64,
    pub duration_months: u32,
    pub max_members: u32,
    pub total_members: u32,
    pub total_staked: u64,
    pub total_rewards: u64,
    pub is_active: bool,
    pub created_at: i64,
    pub bump: u8,
}

impl Group {
    pub const SPACE: usize = 8 + 32 + (4 + MAX_NAME_LEN) + 8 + 8 + 4 + 4 + 4 + 8 + 8 + 1 + 8 + 1 + 64;
}

#[account]
pub struct Member {
    pub group: Pubkey,
    pub authority: Pubkey,
    pub total_deposited: u64,
    pub deposit_count: u32,
    pub streak_count: u32,
    pub total_fees_paid: u64,
    pub stake_accounts: Vec<Pubkey>,
    pub join_date: i64,
    pub is_active: bool,
    pub bump: u8,
}

impl Member {
    pub fn space(n: usize) -> usize {
        8       // discriminator
        + 32    // group
        + 32    // authority
        + 8     // total_deposited
        + 4     // deposit_count
        + 4     // streak_count
        + 8     // total_fees_paid
        + 4 + n * 32  // stake_accounts
        + 8     // join_date
        + 1     // is_active
        + 1     // bump
    }
}

#[account]
pub struct Treasury {
    pub total_collected: u64,
    pub treasury_balance: u64,
    pub liquidity_balance: u64,
    pub bump: u8,
}

impl Treasury {
    pub const SPACE: usize = 8 + 8 + 8 + 8 + 1 + 32;
}

#[account]
pub struct CreatorRewards {
    pub group: Pubkey,
    pub creator_address: Pubkey,
    pub total_earned: u64,
    pub claimed: u64,
    pub bump: u8,
}

impl CreatorRewards {
    pub const SPACE: usize = 8 + 32 + 32 + 8 + 8 + 1 + 32;
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

#[derive(Accounts)]
pub struct InitializeTreasury<'info> {
    #[account(
        init,
        payer = authority,
        space = Treasury::SPACE,
        seeds = [b"treasury"],
        bump,
    )]
    pub treasury: Account<'info, Treasury>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ChargeDepositFee<'info> {
    #[account(
        mut,
        seeds = [b"treasury"],
        bump = treasury.bump,
    )]
    pub treasury: Account<'info, Treasury>,

    #[account(
        init_if_needed,
        payer = payer,
        space = CreatorRewards::SPACE,
        seeds = [b"creator_rewards", group.key().as_ref()],
        bump,
    )]
    pub creator_rewards: Account<'info, CreatorRewards>,

    #[account(mut)]
    pub group: Account<'info, Group>,

    #[account(
        mut,
        seeds = [b"member", group.key().as_ref(), payer.key().as_ref()],
        bump = member.bump,
        realloc = Member::space(member.stake_accounts.len() + 1),
        realloc::payer = payer,
        realloc::zero = false,
    )]
    pub member: Account<'info, Member>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimRewardsWithFee<'info> {
    #[account(
        mut,
        seeds = [b"treasury"],
        bump = treasury.bump,
    )]
    pub treasury: Account<'info, Treasury>,

    #[account(
        mut,
        seeds = [b"creator_rewards", group.key().as_ref()],
        bump = creator_rewards.bump,
    )]
    pub creator_rewards: Account<'info, CreatorRewards>,

    #[account(mut)]
    pub group: Account<'info, Group>,

    #[account(mut)]
    pub withdrawal_authority: Signer<'info>,

    pub system_program: Program<'info, System>,
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
    #[msg("Insufficient funds for fee")]
    InsufficientFunds,
    #[msg("Treasury account error")]
    TreasuryError,
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

#[event]
pub struct FeeCollectedEvent {
    pub fee_type: u8,
    pub total_fee: u64,
    pub treasury_amount: u64,
    pub liquidity_amount: u64,
    pub creator_amount: u64,
    pub group: Pubkey,
    pub member: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct TreasuryBalanceUpdated {
    pub total_collected: u64,
    pub treasury_balance: u64,
    pub liquidity_balance: u64,
}
