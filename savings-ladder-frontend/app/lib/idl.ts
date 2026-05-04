// IDL for SavingsLadder Anchor program (Marinade Native — ledger-only)
// ⚠️  Discriminators are derived from the snake_case function names used in the Rust program.
//     These MUST match the compiled output in target/idl/savings_ladder.json exactly.
export const IDL = {
  address: process.env.NEXT_PUBLIC_PROGRAM_ID || 'FdjoGvS6LpXJGL5rDP6rteg2ethHwbsxWeZ2P1PfQY8E',
  metadata: {
    name: 'savings_ladder',
    version: '0.1.0',
    spec: '0.1.0',
    description: 'SavingsLadder - Group Savings on Solana with Marinade Native Staking',
  },
  instructions: [
    {
      name: 'close_group',
      discriminator: [40, 187, 201, 187, 18, 194, 122, 232],
      accounts: [
        { name: 'group', writable: true },
        { name: 'authority', signer: true },
      ],
      args: [],
    },
    {
      name: 'create_group',
      discriminator: [79, 60, 158, 134, 61, 199, 56, 248],
      accounts: [
        {
          name: 'group',
          writable: true,
          pda: {
            seeds: [
              { kind: 'const', value: [103, 114, 111, 117, 112] },
              { kind: 'account', path: 'authority' },
              { kind: 'arg', path: 'name' },
            ],
          },
        },
        { name: 'authority', writable: true, signer: true },
        { name: 'system_program', address: '11111111111111111111111111111111' },
      ],
      args: [
        { name: 'name', type: 'string' },
        { name: 'target_amount', type: 'u64' },
        { name: 'monthly_contribution', type: 'u64' },
        { name: 'duration_months', type: 'u32' },
        { name: 'max_members', type: 'u32' },
      ],
    },
    {
      name: 'distribute_rewards',
      discriminator: [97, 6, 227, 255, 124, 165, 3, 148],
      accounts: [
        { name: 'group', writable: true },
        { name: 'authority', signer: true },
      ],
      args: [{ name: 'amount', type: 'u64' }],
    },
    {
      name: 'join_group',
      discriminator: [121, 56, 199, 19, 250, 70, 44, 184],
      accounts: [
        { name: 'group', writable: true },
        {
          name: 'member',
          writable: true,
          pda: {
            seeds: [
              { kind: 'const', value: [109, 101, 109, 98, 101, 114] },
              { kind: 'account', path: 'group' },
              { kind: 'account', path: 'authority' },
            ],
          },
        },
        { name: 'authority', writable: true, signer: true },
        { name: 'system_program', address: '11111111111111111111111111111111' },
      ],
      args: [],
    },
    {
      name: 'record_deposit',
      discriminator: [98, 130, 249, 185, 16, 42, 16, 162],
      accounts: [
        { name: 'group', writable: true },
        {
          name: 'member',
          writable: true,
          pda: {
            seeds: [
              { kind: 'const', value: [109, 101, 109, 98, 101, 114] },
              { kind: 'account', path: 'group' },
              { kind: 'account', path: 'authority' },
            ],
          },
        },
        { name: 'authority', writable: true, signer: true },
        { name: 'system_program', address: '11111111111111111111111111111111' },
      ],
      args: [
        { name: 'amount_lamports', type: 'u64' },
        { name: 'stake_account', type: 'pubkey' },
      ],
    },
    {
      name: 'record_withdrawal',
      discriminator: [171, 163, 42, 100, 42, 10, 78, 94],
      accounts: [
        { name: 'group', writable: true },
        {
          name: 'member',
          writable: true,
          pda: {
            seeds: [
              { kind: 'const', value: [109, 101, 109, 98, 101, 114] },
              { kind: 'account', path: 'group' },
              { kind: 'account', path: 'authority' },
            ],
          },
        },
        { name: 'authority', writable: true, signer: true },
        { name: 'system_program', address: '11111111111111111111111111111111' },
      ],
      args: [
        { name: 'amount_lamports', type: 'u64' },
        { name: 'stake_account', type: 'pubkey' },
      ],
    },
  ],
  accounts: [
    {
      name: 'Group',
      discriminator: [209, 249, 208, 63, 182, 89, 186, 254],
    },
    {
      name: 'Member',
      discriminator: [54, 19, 162, 21, 29, 166, 17, 198],
    },
  ],
  events: [
    { name: 'DepositRecordedEvent', discriminator: [191, 121, 153, 85, 98, 220, 125, 70] },
    { name: 'GroupClosedEvent', discriminator: [7, 196, 19, 141, 9, 60, 198, 52] },
    { name: 'GroupCreatedEvent', discriminator: [250, 133, 157, 109, 66, 48, 195, 80] },
    { name: 'GroupJoinedEvent', discriminator: [130, 63, 109, 140, 151, 199, 156, 62] },
    { name: 'RewardsDistributedEvent', discriminator: [172, 133, 113, 45, 218, 113, 160, 226] },
    { name: 'WithdrawalRecordedEvent', discriminator: [210, 214, 233, 49, 198, 211, 199, 238] },
  ],
  types: [
    {
      name: 'DepositRecordedEvent',
      type: {
        kind: 'struct',
        fields: [
          { name: 'group', type: 'pubkey' },
          { name: 'member', type: 'pubkey' },
          { name: 'amount_lamports', type: 'u64' },
          { name: 'stake_account', type: 'pubkey' },
          { name: 'deposit_count', type: 'u32' },
        ],
      },
    },
    {
      name: 'Group',
      type: {
        kind: 'struct',
        fields: [
          { name: 'authority', type: 'pubkey' },
          { name: 'name', type: 'string' },
          { name: 'target_amount', type: 'u64' },
          { name: 'monthly_contribution', type: 'u64' },
          { name: 'duration_months', type: 'u32' },
          { name: 'max_members', type: 'u32' },
          { name: 'total_members', type: 'u32' },
          { name: 'total_staked', type: 'u64' },
          { name: 'total_rewards', type: 'u64' },
          { name: 'is_active', type: 'bool' },
          { name: 'created_at', type: 'i64' },
          { name: 'bump', type: 'u8' },
        ],
      },
    },
    {
      name: 'GroupClosedEvent',
      type: {
        kind: 'struct',
        fields: [
          { name: 'group', type: 'pubkey' },
          { name: 'authority', type: 'pubkey' },
        ],
      },
    },
    {
      name: 'GroupCreatedEvent',
      type: {
        kind: 'struct',
        fields: [
          { name: 'group', type: 'pubkey' },
          { name: 'authority', type: 'pubkey' },
          { name: 'name', type: 'string' },
          { name: 'target_amount', type: 'u64' },
        ],
      },
    },
    {
      name: 'GroupJoinedEvent',
      type: {
        kind: 'struct',
        fields: [
          { name: 'group', type: 'pubkey' },
          { name: 'member', type: 'pubkey' },
          { name: 'total_members', type: 'u32' },
        ],
      },
    },
    {
      name: 'Member',
      type: {
        kind: 'struct',
        fields: [
          { name: 'group', type: 'pubkey' },
          { name: 'authority', type: 'pubkey' },
          { name: 'total_deposited', type: 'u64' },
          { name: 'deposit_count', type: 'u32' },
          { name: 'streak_count', type: 'u32' },
          { name: 'stake_accounts', type: { vec: 'pubkey' } },
          { name: 'join_date', type: 'i64' },
          { name: 'is_active', type: 'bool' },
          { name: 'bump', type: 'u8' },
        ],
      },
    },
    {
      name: 'RewardsDistributedEvent',
      type: {
        kind: 'struct',
        fields: [
          { name: 'group', type: 'pubkey' },
          { name: 'amount', type: 'u64' },
          { name: 'total_rewards', type: 'u64' },
        ],
      },
    },
    {
      name: 'WithdrawalRecordedEvent',
      type: {
        kind: 'struct',
        fields: [
          { name: 'group', type: 'pubkey' },
          { name: 'member', type: 'pubkey' },
          { name: 'amount_lamports', type: 'u64' },
          { name: 'stake_account', type: 'pubkey' },
        ],
      },
    },
  ],
  errors: [
    { code: 6000, name: 'NameTooLong', msg: 'Name must be 1-50 characters' },
    { code: 6001, name: 'InvalidAmount', msg: 'Amount must be greater than zero' },
    { code: 6002, name: 'InvalidDuration', msg: 'Duration must be 1-36 months' },
    { code: 6003, name: 'InvalidMaxMembers', msg: 'Max members must be 2-50' },
    { code: 6004, name: 'GroupInactive', msg: 'Group is not active' },
    { code: 6005, name: 'GroupFull', msg: 'Group has reached maximum capacity' },
    { code: 6006, name: 'MemberInactive', msg: 'Member is not active' },
    { code: 6007, name: 'NoMembers', msg: 'Cannot distribute rewards with no members' },
    { code: 6008, name: 'InsufficientBalance', msg: 'Insufficient staked balance' },
    { code: 6009, name: 'TooManyStakeAccounts', msg: 'Too many stake accounts (max 50)' },
    { code: 6010, name: 'Overflow', msg: 'Arithmetic overflow' },
    { code: 6011, name: 'Unauthorized', msg: 'Unauthorized' },
  ],
} as const;

export type SavingsLadderIDL = typeof IDL;
