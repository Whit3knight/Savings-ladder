use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer, Mint};

declare_id!("4xgharpczryhKNFB9KpqhuCswggM6mdLve8epAr7k2Q7");

#[program]
pub mod savings_ladder {
    use super::*;

    /// Create a new savings group with a vault PDA
    pub fn create_group(
        ctx: Context<CreateGroup>,
        name: String,
        target_amount: u64,
        monthly_contribution: u64,
        duration_months: u32,
        max_members: u32,
    ) -> Result<()> {
        require!(name.len() <= 50, SavingsError::NameTooLong);
        require!(target_amount > 0, SavingsError::InvalidAmount);
        require!(monthly_contribution > 0, SavingsError::InvalidAmount);
        require!(
            duration_months > 0 && duration_months <= 36,
            SavingsError::InvalidDuration
        );
        require!(
            max_members >= 2 && max_members <= 50,
            SavingsError::InvalidMaxMembers
        );

        let group = &mut ctx.accounts.group;
        group.authority = ctx.accounts.authority.key();
        group.name = name.clone();
        group.target_amount = target_amount;
        group.monthly_contribution = monthly_contribution;
        group.duration_months = duration_months;
        group.max_members = max_members;
        group.total_members = 0;
        group.total_accumulated = 0;
        group.total_interest = 0;
        group.vault = ctx.accounts.vault.key();
        group.is_active = true;
        group.created_at = Clock::get()?.unix_timestamp;
        group.bump = ctx.bumps.group;
        group.vault_bump = ctx.bumps.vault;

        emit!(GroupCreatedEvent {
            group: group.key(),
            authority: ctx.accounts.authority.key(),
            name,
            target_amount,
            monthly_contribution,
            duration_months,
            max_members,
        });

        Ok(())
    }

    /// Join an existing savings group
    pub fn join_group(ctx: Context<JoinGroup>) -> Result<()> {
        let group = &mut ctx.accounts.group;

        require!(group.is_active, SavingsError::GroupInactive);
        require!(
            group.total_members < group.max_members,
            SavingsError::GroupFull
        );

        group.total_members = group
            .total_members
            .checked_add(1)
            .ok_or(SavingsError::Overflow)?;

        let member = &mut ctx.accounts.member;
        member.group = group.key();
        member.authority = ctx.accounts.authority.key();
        member.total_deposited = 0;
        member.total_withdrawn = 0;
        member.deposit_count = 0;
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

    /// Deposit tokens monthly into the group vault
    pub fn deposit_monthly(ctx: Context<DepositMonthly>, amount: u64) -> Result<()> {
        require!(amount > 0, SavingsError::InvalidAmount);

        let group = &mut ctx.accounts.group;
        let member = &mut ctx.accounts.member;

        require!(group.is_active, SavingsError::GroupInactive);
        require!(member.is_active, SavingsError::MemberInactive);

        // Transfer SPL tokens from user to vault
        let transfer_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.user_token_account.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.authority.to_account_info(),
            },
        );
        token::transfer(transfer_ctx, amount)?;

        member.total_deposited = member
            .total_deposited
            .checked_add(amount)
            .ok_or(SavingsError::Overflow)?;
        member.deposit_count = member
            .deposit_count
            .checked_add(1)
            .ok_or(SavingsError::Overflow)?;

        group.total_accumulated = group
            .total_accumulated
            .checked_add(amount)
            .ok_or(SavingsError::Overflow)?;

        emit!(DepositEvent {
            group: group.key(),
            member: ctx.accounts.authority.key(),
            amount,
            new_total: member.total_deposited,
            deposit_count: member.deposit_count,
        });

        Ok(())
    }

    /// Distribute staking rewards (authority only)
    pub fn distribute_rewards(ctx: Context<DistributeRewards>, amount: u64) -> Result<()> {
        require!(amount > 0, SavingsError::InvalidAmount);

        let group = &mut ctx.accounts.group;

        require!(group.is_active, SavingsError::GroupInactive);
        require!(group.total_members > 0, SavingsError::NoMembers);
        require!(
            group.authority == ctx.accounts.authority.key(),
            SavingsError::Unauthorized
        );

        group.total_interest = group
            .total_interest
            .checked_add(amount)
            .ok_or(SavingsError::Overflow)?;

        emit!(RewardDistributedEvent {
            group: group.key(),
            amount,
            total_interest: group.total_interest,
            total_members: group.total_members,
        });

        Ok(())
    }

    /// Claim proportional share of interest rewards
    pub fn claim_reward(ctx: Context<ClaimReward>) -> Result<()> {
        let group = &ctx.accounts.group;
        let member = &ctx.accounts.member;

        require!(group.is_active, SavingsError::GroupInactive);
        require!(member.is_active, SavingsError::MemberInactive);

        let member_share = if group.total_accumulated > 0 {
            (member.total_deposited as u128)
                .checked_mul(group.total_interest as u128)
                .ok_or(SavingsError::Overflow)?
                .checked_div(group.total_accumulated as u128)
                .ok_or(SavingsError::Overflow)? as u64
        } else {
            0
        };

        require!(member_share > 0, SavingsError::InvalidAmount);

        let group_key = group.key();
        let seeds = &[b"vault", group_key.as_ref(), &[group.vault_bump]];
        let signer_seeds = &[&seeds[..]];

        let transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.user_token_account.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
            },
            signer_seeds,
        );
        token::transfer(transfer_ctx, member_share)?;

        emit!(RewardClaimedEvent {
            group: group.key(),
            member: ctx.accounts.authority.key(),
            amount: member_share,
        });

        Ok(())
    }

    /// Unlock a microloan (requires >= 3 deposit cycles, max 5x savings)
    pub fn unlock_microloan(
        ctx: Context<UnlockMicroloan>,
        loan_amount: u64,
        repayment_months: u32,
    ) -> Result<()> {
        let member = &ctx.accounts.member;
        let group = &ctx.accounts.group;

        require!(group.is_active, SavingsError::GroupInactive);
        require!(member.is_active, SavingsError::MemberInactive);
        require!(loan_amount > 0, SavingsError::InvalidAmount);
        require!(
            repayment_months > 0 && repayment_months <= 24,
            SavingsError::InvalidDuration
        );
        require!(
            member.deposit_count >= 3,
            SavingsError::InsufficientCycles
        );

        let max_loan = member
            .total_deposited
            .checked_mul(5)
            .ok_or(SavingsError::Overflow)?;
        require!(loan_amount <= max_loan, SavingsError::LoanTooLarge);

        let microloan = &mut ctx.accounts.microloan;
        microloan.member = member.key();
        microloan.group = group.key();
        microloan.authority = ctx.accounts.authority.key();
        microloan.loan_amount = loan_amount;
        microloan.remaining_amount = loan_amount;
        microloan.repayment_months = repayment_months;
        microloan.interest_rate = 50; // 0.5% per month
        microloan.created_at = Clock::get()?.unix_timestamp;
        microloan.is_active = true;
        microloan.bump = ctx.bumps.microloan;

        let group_key = group.key();
        let seeds = &[b"vault", group_key.as_ref(), &[group.vault_bump]];
        let signer_seeds = &[&seeds[..]];

        let transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.user_token_account.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
            },
            signer_seeds,
        );
        token::transfer(transfer_ctx, loan_amount)?;

        emit!(MicroLoanUnlockedEvent {
            group: group.key(),
            member: ctx.accounts.authority.key(),
            loan_amount,
            repayment_months,
        });

        Ok(())
    }

    /// Repay microloan installment
    pub fn repay_microloan(ctx: Context<RepayMicroloan>, amount: u64) -> Result<()> {
        require!(amount > 0, SavingsError::InvalidAmount);

        let microloan = &mut ctx.accounts.microloan;
        require!(microloan.is_active, SavingsError::LoanInactive);
        require!(
            amount <= microloan.remaining_amount,
            SavingsError::OverRepayment
        );

        let transfer_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.user_token_account.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.authority.to_account_info(),
            },
        );
        token::transfer(transfer_ctx, amount)?;

        microloan.remaining_amount = microloan
            .remaining_amount
            .checked_sub(amount)
            .ok_or(SavingsError::Overflow)?;

        if microloan.remaining_amount == 0 {
            microloan.is_active = false;
        }

        emit!(LoanRepaidEvent {
            group: microloan.group,
            member: ctx.accounts.authority.key(),
            amount_paid: amount,
            remaining: microloan.remaining_amount,
        });

        Ok(())
    }

    /// Close group (authority only)
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

// ═══════════════════════════════════════════════════════════════
// ACCOUNTS
// ═══════════════════════════════════════════════════════════════

#[account]
#[derive(Default)]
pub struct Group {
    pub authority: Pubkey,
    pub name: String,
    pub target_amount: u64,
    pub monthly_contribution: u64,
    pub duration_months: u32,
    pub max_members: u32,
    pub total_members: u32,
    pub total_accumulated: u64,
    pub total_interest: u64,
    pub vault: Pubkey,
    pub is_active: bool,
    pub created_at: i64,
    pub bump: u8,
    pub vault_bump: u8,
}

#[account]
#[derive(Default)]
pub struct Member {
    pub group: Pubkey,
    pub authority: Pubkey,
    pub total_deposited: u64,
    pub total_withdrawn: u64,
    pub deposit_count: u32,
    pub join_date: i64,
    pub is_active: bool,
    pub bump: u8,
}

#[account]
#[derive(Default)]
pub struct MicroLoan {
    pub member: Pubkey,
    pub group: Pubkey,
    pub authority: Pubkey,
    pub loan_amount: u64,
    pub remaining_amount: u64,
    pub repayment_months: u32,
    pub interest_rate: u32,
    pub created_at: i64,
    pub is_active: bool,
    pub bump: u8,
}

// ═══════════════════════════════════════════════════════════════
// INSTRUCTION CONTEXTS
// ═══════════════════════════════════════════════════════════════

#[derive(Accounts)]
#[instruction(name: String)]
pub struct CreateGroup<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + (4 + 50) + 8 + 8 + 4 + 4 + 4 + 8 + 8 + 32 + 1 + 8 + 1 + 1 + 64,
        seeds = [b"group", authority.key().as_ref(), name.as_bytes()],
        bump,
    )]
    pub group: Account<'info, Group>,

    #[account(
        init,
        payer = authority,
        token::mint = mint,
        token::authority = vault,
        seeds = [b"vault", group.key().as_ref()],
        bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub mint: Account<'info, Mint>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct JoinGroup<'info> {
    #[account(
        mut,
        constraint = group.is_active @ SavingsError::GroupInactive,
    )]
    pub group: Account<'info, Group>,

    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 32 + 8 + 8 + 4 + 8 + 1 + 1 + 32,
        seeds = [b"member", group.key().as_ref(), authority.key().as_ref()],
        bump,
    )]
    pub member: Account<'info, Member>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositMonthly<'info> {
    #[account(mut)]
    pub group: Account<'info, Group>,

    #[account(
        mut,
        seeds = [b"member", group.key().as_ref(), authority.key().as_ref()],
        bump = member.bump,
        constraint = member.group == group.key() @ SavingsError::MemberInactive,
    )]
    pub member: Account<'info, Member>,

    #[account(
        mut,
        seeds = [b"vault", group.key().as_ref()],
        bump = group.vault_bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = user_token_account.owner == authority.key(),
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct DistributeRewards<'info> {
    #[account(mut)]
    pub group: Account<'info, Group>,

    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct ClaimReward<'info> {
    #[account(mut)]
    pub group: Account<'info, Group>,

    #[account(
        seeds = [b"member", group.key().as_ref(), authority.key().as_ref()],
        bump = member.bump,
        constraint = member.group == group.key(),
    )]
    pub member: Account<'info, Member>,

    #[account(
        mut,
        seeds = [b"vault", group.key().as_ref()],
        bump = group.vault_bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = user_token_account.owner == authority.key(),
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    pub authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct UnlockMicroloan<'info> {
    #[account(mut)]
    pub group: Account<'info, Group>,

    #[account(
        seeds = [b"member", group.key().as_ref(), authority.key().as_ref()],
        bump = member.bump,
        constraint = member.group == group.key(),
    )]
    pub member: Account<'info, Member>,

    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 32 + 32 + 8 + 8 + 4 + 4 + 8 + 1 + 1 + 32,
        seeds = [b"loan", member.key().as_ref(), group.key().as_ref()],
        bump,
    )]
    pub microloan: Account<'info, MicroLoan>,

    #[account(
        mut,
        seeds = [b"vault", group.key().as_ref()],
        bump = group.vault_bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = user_token_account.owner == authority.key(),
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct RepayMicroloan<'info> {
    #[account(mut)]
    pub group: Account<'info, Group>,

    #[account(
        mut,
        seeds = [b"loan", member.key().as_ref(), group.key().as_ref()],
        bump = microloan.bump,
    )]
    pub microloan: Account<'info, MicroLoan>,

    #[account(
        seeds = [b"member", group.key().as_ref(), authority.key().as_ref()],
        bump = member.bump,
    )]
    pub member: Account<'info, Member>,

    #[account(
        mut,
        seeds = [b"vault", group.key().as_ref()],
        bump = group.vault_bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = user_token_account.owner == authority.key(),
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CloseGroup<'info> {
    #[account(mut)]
    pub group: Account<'info, Group>,

    pub authority: Signer<'info>,
}

// ═══════════════════════════════════════════════════════════════
// ERRORS
// ═══════════════════════════════════════════════════════════════

#[error_code]
pub enum SavingsError {
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Group name exceeds 50 characters")]
    NameTooLong,
    #[msg("Duration must be between 1-36 months")]
    InvalidDuration,
    #[msg("Max members must be between 2-50")]
    InvalidMaxMembers,
    #[msg("This group is no longer active")]
    GroupInactive,
    #[msg("This group has reached maximum capacity")]
    GroupFull,
    #[msg("Member is not active in this group")]
    MemberInactive,
    #[msg("Cannot distribute rewards with 0 members")]
    NoMembers,
    #[msg("Need at least 3 deposit cycles for microloan")]
    InsufficientCycles,
    #[msg("Loan amount exceeds 5x your total savings")]
    LoanTooLarge,
    #[msg("This loan is no longer active")]
    LoanInactive,
    #[msg("Repayment exceeds remaining loan balance")]
    OverRepayment,
    #[msg("Arithmetic overflow detected")]
    Overflow,
    #[msg("You are not authorized for this action")]
    Unauthorized,
}

// ═══════════════════════════════════════════════════════════════
// EVENTS
// ═══════════════════════════════════════════════════════════════

#[event]
pub struct GroupCreatedEvent {
    pub group: Pubkey,
    pub authority: Pubkey,
    pub name: String,
    pub target_amount: u64,
    pub monthly_contribution: u64,
    pub duration_months: u32,
    pub max_members: u32,
}

#[event]
pub struct GroupJoinedEvent {
    pub group: Pubkey,
    pub member: Pubkey,
    pub total_members: u32,
}

#[event]
pub struct DepositEvent {
    pub group: Pubkey,
    pub member: Pubkey,
    pub amount: u64,
    pub new_total: u64,
    pub deposit_count: u32,
}

#[event]
pub struct RewardDistributedEvent {
    pub group: Pubkey,
    pub amount: u64,
    pub total_interest: u64,
    pub total_members: u32,
}

#[event]
pub struct RewardClaimedEvent {
    pub group: Pubkey,
    pub member: Pubkey,
    pub amount: u64,
}

#[event]
pub struct MicroLoanUnlockedEvent {
    pub group: Pubkey,
    pub member: Pubkey,
    pub loan_amount: u64,
    pub repayment_months: u32,
}

#[event]
pub struct LoanRepaidEvent {
    pub group: Pubkey,
    pub member: Pubkey,
    pub amount_paid: u64,
    pub remaining: u64,
}

#[event]
pub struct GroupClosedEvent {
    pub group: Pubkey,
    pub authority: Pubkey,
}
