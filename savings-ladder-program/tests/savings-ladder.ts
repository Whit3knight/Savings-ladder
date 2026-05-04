import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert } from "chai";
type Program = anchor.Program;

describe("savings_ladder", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.SavingsLadder as Program;

  const authority = provider.wallet as anchor.Wallet;
  const member2 = Keypair.generate();
  const fakeStake = Keypair.generate().publicKey;

  let groupPDA: PublicKey;
  let groupBump: number;
  let memberPDA: PublicKey;
  let member2PDA: PublicKey;

  const GROUP_NAME = "Test Group";
  const TARGET = new anchor.BN(10 * LAMPORTS_PER_SOL);
  const MONTHLY = new anchor.BN(1 * LAMPORTS_PER_SOL);

  function findGroup(auth: PublicKey, name: string) {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("group"), auth.toBuffer(), Buffer.from(name)],
      program.programId
    );
  }
  function findMember(group: PublicKey, auth: PublicKey) {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("member"), group.toBuffer(), auth.toBuffer()],
      program.programId
    );
  }

  before(async () => {
    // Airdrop to member2 for tests
    const sig = await provider.connection.requestAirdrop(member2.publicKey, 2 * LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(sig, "confirmed");
    [groupPDA, groupBump] = findGroup(authority.publicKey, GROUP_NAME);
    [memberPDA] = findMember(groupPDA, authority.publicKey);
    [member2PDA] = findMember(groupPDA, member2.publicKey);
  });

  // ── 1. create_group success ────────────────────────────────────
  it("creates a group successfully", async () => {
    await program.methods
      .createGroup(GROUP_NAME, TARGET, MONTHLY, 12, 10)
      .accountsPartial({ group: groupPDA, authority: authority.publicKey, systemProgram: SystemProgram.programId })
      .rpc();

    const grp = await program.account.group.fetch(groupPDA);
    assert.equal(grp.name, GROUP_NAME);
    assert.ok(grp.targetAmount.eq(TARGET));
    assert.ok(grp.monthlyContribution.eq(MONTHLY));
    assert.equal(grp.durationMonths, 12);
    assert.equal(grp.maxMembers, 10);
    assert.equal(grp.totalMembers, 0);
    assert.ok(grp.isActive);
  });

  // ── 2. create_group: name too long ────────────────────────────
  it("rejects group name exceeding 50 chars", async () => {
    const longName = "a".repeat(51);
    const [badPDA] = findGroup(authority.publicKey, longName);
    try {
      await program.methods
        .createGroup(longName, TARGET, MONTHLY, 12, 10)
        .accountsPartial({ group: badPDA, authority: authority.publicKey, systemProgram: SystemProgram.programId })
        .rpc();
      assert.fail("Should have thrown");
    } catch (e: any) {
      assert.include(e.toString(), "NameTooLong");
    }
  });

  // ── 3. create_group: invalid target ───────────────────────────
  it("rejects zero target amount", async () => {
    const [badPDA] = findGroup(authority.publicKey, "zero-target");
    try {
      await program.methods
        .createGroup("zero-target", new anchor.BN(0), MONTHLY, 12, 10)
        .accountsPartial({ group: badPDA, authority: authority.publicKey, systemProgram: SystemProgram.programId })
        .rpc();
      assert.fail("Should have thrown");
    } catch (e: any) {
      assert.include(e.toString(), "InvalidAmount");
    }
  });

  // ── 4. create_group: invalid duration ─────────────────────────
  it("rejects duration over 36 months", async () => {
    const [badPDA] = findGroup(authority.publicKey, "long-duration");
    try {
      await program.methods
        .createGroup("long-duration", TARGET, MONTHLY, 37, 10)
        .accountsPartial({ group: badPDA, authority: authority.publicKey, systemProgram: SystemProgram.programId })
        .rpc();
      assert.fail("Should have thrown");
    } catch (e: any) {
      assert.include(e.toString(), "InvalidDuration");
    }
  });

  // ── 5. create_group: invalid max_members ─────────────────────
  it("rejects max_members = 1", async () => {
    const [badPDA] = findGroup(authority.publicKey, "one-member");
    try {
      await program.methods
        .createGroup("one-member", TARGET, MONTHLY, 12, 1)
        .accountsPartial({ group: badPDA, authority: authority.publicKey, systemProgram: SystemProgram.programId })
        .rpc();
      assert.fail("Should have thrown");
    } catch (e: any) {
      assert.include(e.toString(), "InvalidMaxMembers");
    }
  });

  // ── 6. join_group: authority joins ───────────────────────────
  it("creator joins the group successfully", async () => {
    await program.methods
      .joinGroup()
      .accountsPartial({ group: groupPDA, member: memberPDA, authority: authority.publicKey, systemProgram: SystemProgram.programId })
      .rpc();

    const grp = await program.account.group.fetch(groupPDA);
    assert.equal(grp.totalMembers, 1);
    const mem = await program.account.member.fetch(memberPDA);
    assert.ok(mem.isActive);
    assert.equal(mem.depositCount, 0);
    assert.equal(mem.stakeAccounts.length, 0);
  });

  // ── 7. join_group: second member joins ───────────────────────
  it("second member joins successfully", async () => {
    await program.methods
      .joinGroup()
      .accountsPartial({ group: groupPDA, member: member2PDA, authority: member2.publicKey, systemProgram: SystemProgram.programId })
      .signers([member2])
      .rpc();

    const grp = await program.account.group.fetch(groupPDA);
    assert.equal(grp.totalMembers, 2);
  });

  // ── 8. record_deposit: success ───────────────────────────────
  it("records a deposit with stake account", async () => {
    const amount = new anchor.BN(1 * LAMPORTS_PER_SOL);
    await program.methods
      .recordDeposit(amount, fakeStake)
      .accountsPartial({ group: groupPDA, member: memberPDA, authority: authority.publicKey, systemProgram: SystemProgram.programId })
      .rpc();

    const mem = await program.account.member.fetch(memberPDA);
    assert.ok(mem.totalDeposited.eq(amount));
    assert.equal(mem.depositCount, 1);
    assert.equal(mem.stakeAccounts.length, 1);
    assert.equal(mem.stakeAccounts[0].toBase58(), fakeStake.toBase58());

    const grp = await program.account.group.fetch(groupPDA);
    assert.ok(grp.totalStaked.eq(amount));
  });

  // ── 9. record_deposit: second deposit ────────────────────────
  it("records a second deposit, growing stake_accounts", async () => {
    const fakeStake2 = Keypair.generate().publicKey;
    const amount = new anchor.BN(LAMPORTS_PER_SOL);
    await program.methods
      .recordDeposit(amount, fakeStake2)
      .accountsPartial({ group: groupPDA, member: memberPDA, authority: authority.publicKey, systemProgram: SystemProgram.programId })
      .rpc();

    const mem = await program.account.member.fetch(memberPDA);
    assert.equal(mem.stakeAccounts.length, 2);
    assert.equal(mem.depositCount, 2);
  });

  // ── 10. record_deposit: zero amount ──────────────────────────
  it("rejects zero-lamport deposit", async () => {
    try {
      await program.methods
        .recordDeposit(new anchor.BN(0), fakeStake)
        .accountsPartial({ group: groupPDA, member: memberPDA, authority: authority.publicKey, systemProgram: SystemProgram.programId })
        .rpc();
      assert.fail("Should have thrown");
    } catch (e: any) {
      assert.include(e.toString(), "InvalidAmount");
    }
  });

  // ── 11. record_withdrawal: success ───────────────────────────
  it("records a withdrawal, removes stake account", async () => {
    const amount = new anchor.BN(LAMPORTS_PER_SOL);
    const memBefore = await program.account.member.fetch(memberPDA);
    const stakeToRemove = memBefore.stakeAccounts[0];

    await program.methods
      .recordWithdrawal(amount, stakeToRemove)
      .accountsPartial({ group: groupPDA, member: memberPDA, authority: authority.publicKey, systemProgram: SystemProgram.programId })
      .rpc();

    const mem = await program.account.member.fetch(memberPDA);
    assert.equal(mem.stakeAccounts.length, 1);
    assert.ok(mem.totalDeposited.lt(memBefore.totalDeposited));
  });

  // ── 12. record_withdrawal: insufficient balance ───────────────
  it("rejects withdrawal exceeding balance", async () => {
    const huge = new anchor.BN(999 * LAMPORTS_PER_SOL);
    try {
      await program.methods
        .recordWithdrawal(huge, fakeStake)
        .accountsPartial({ group: groupPDA, member: memberPDA, authority: authority.publicKey, systemProgram: SystemProgram.programId })
        .rpc();
      assert.fail("Should have thrown");
    } catch (e: any) {
      assert.include(e.toString(), "InsufficientBalance");
    }
  });

  // ── 13. distribute_rewards: success ─────────────────────────
  it("authority records rewards", async () => {
    const rewardAmt = new anchor.BN(0.05 * LAMPORTS_PER_SOL);
    await program.methods
      .distributeRewards(rewardAmt)
      .accountsPartial({ group: groupPDA, authority: authority.publicKey })
      .rpc();

    const grp = await program.account.group.fetch(groupPDA);
    assert.ok(grp.totalRewards.eq(rewardAmt));
  });

  // ── 14. distribute_rewards: unauthorized ─────────────────────
  it("non-authority cannot distribute rewards", async () => {
    try {
      await program.methods
        .distributeRewards(new anchor.BN(100))
        .accountsPartial({ group: groupPDA, authority: member2.publicKey })
        .signers([member2])
        .rpc();
      assert.fail("Should have thrown");
    } catch (e: any) {
      assert.include(e.toString(), "Unauthorized");
    }
  });

  // ── 15. close_group: unauthorized ─────────────────────────────
  it("non-authority cannot close group", async () => {
    try {
      await program.methods
        .closeGroup()
        .accountsPartial({ group: groupPDA, authority: member2.publicKey })
        .signers([member2])
        .rpc();
      assert.fail("Should have thrown");
    } catch (e: any) {
      assert.include(e.toString(), "Unauthorized");
    }
  });

  // ── 16. close_group: success ──────────────────────────────────
  it("authority closes the group", async () => {
    await program.methods
      .closeGroup()
      .accountsPartial({ group: groupPDA, authority: authority.publicKey })
      .rpc();

    const grp = await program.account.group.fetch(groupPDA);
    assert.equal(grp.isActive, false);
  });

  // ── 17. join_group: inactive group ───────────────────────────
  it("cannot join an inactive group", async () => {
    const member3 = Keypair.generate();
    const sig = await provider.connection.requestAirdrop(member3.publicKey, LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(sig);
    const [m3PDA] = findMember(groupPDA, member3.publicKey);
    try {
      await program.methods
        .joinGroup()
        .accountsPartial({ group: groupPDA, member: m3PDA, authority: member3.publicKey, systemProgram: SystemProgram.programId })
        .signers([member3])
        .rpc();
      assert.fail("Should have thrown");
    } catch (e: any) {
      assert.include(e.toString(), "GroupInactive");
    }
  });

  // ── 18. group full test ───────────────────────────────────────
  it("rejects joining when group is full", async () => {
    // Create a small group (max 2 members) and fill it
    const smallName = "SmallGroup";
    const [smallGroup] = findGroup(authority.publicKey, smallName);
    await program.methods
      .createGroup(smallName, TARGET, MONTHLY, 12, 2)
      .accountsPartial({ group: smallGroup, authority: authority.publicKey, systemProgram: SystemProgram.programId })
      .rpc();

    const [sm1PDA] = findMember(smallGroup, authority.publicKey);
    await program.methods.joinGroup()
      .accountsPartial({ group: smallGroup, member: sm1PDA, authority: authority.publicKey, systemProgram: SystemProgram.programId })
      .rpc();

    await program.methods.joinGroup()
      .accountsPartial({ group: smallGroup, member: member2PDA, authority: member2.publicKey, systemProgram: SystemProgram.programId })
      .signers([member2])
      .rpc();

    const member3 = Keypair.generate();
    const sig = await provider.connection.requestAirdrop(member3.publicKey, LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(sig);
    const [sm3PDA] = findMember(smallGroup, member3.publicKey);
    try {
      await program.methods.joinGroup()
        .accountsPartial({ group: smallGroup, member: sm3PDA, authority: member3.publicKey, systemProgram: SystemProgram.programId })
        .signers([member3])
        .rpc();
      assert.fail("Should have thrown");
    } catch (e: any) {
      assert.include(e.toString(), "GroupFull");
    }
  });
});
