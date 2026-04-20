-- SavingsLadder - Complete Database Schema
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_address TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE,
    avatar_emoji TEXT DEFAULT '👤',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_pubkey TEXT UNIQUE NOT NULL,
    creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(name) <= 50),
    emoji TEXT DEFAULT '🪜',
    description TEXT,
    target_amount BIGINT NOT NULL CHECK (target_amount > 0),
    monthly_contribution BIGINT NOT NULL CHECK (monthly_contribution > 0),
    duration_months INT NOT NULL CHECK (duration_months BETWEEN 1 AND 36),
    max_members INT NOT NULL CHECK (max_members BETWEEN 2 AND 50),
    total_members INT DEFAULT 0,
    total_accumulated BIGINT DEFAULT 0,
    total_interest BIGINT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'closed')),
    invite_code TEXT UNIQUE DEFAULT encode(gen_random_bytes(6), 'hex'),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS group_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    member_pubkey TEXT UNIQUE NOT NULL,
    total_deposited BIGINT DEFAULT 0,
    deposit_count INT DEFAULT 0,
    streak_count INT DEFAULT 0,
    last_deposit_at TIMESTAMPTZ,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true,
    UNIQUE(group_id, user_id)
);

CREATE TABLE IF NOT EXISTS deposits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES group_members(id) ON DELETE CASCADE,
    amount BIGINT NOT NULL CHECK (amount > 0),
    tx_hash TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rewards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    amount BIGINT NOT NULL CHECK (amount > 0),
    apy_rate NUMERIC(5,2) DEFAULT 5.00,
    earned_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS microloans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES group_members(id) ON DELETE CASCADE,
    loan_pubkey TEXT UNIQUE NOT NULL,
    loan_amount BIGINT NOT NULL CHECK (loan_amount > 0),
    remaining_amount BIGINT NOT NULL,
    monthly_payment BIGINT NOT NULL,
    repayment_months INT NOT NULL CHECK (repayment_months BETWEEN 1 AND 24),
    interest_rate NUMERIC(5,2) DEFAULT 0.50,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'defaulted')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS loan_repayments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    loan_id UUID NOT NULL REFERENCES microloans(id) ON DELETE CASCADE,
    amount BIGINT NOT NULL CHECK (amount > 0),
    tx_hash TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    repaid_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS achievements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    badge_type VARCHAR(50) NOT NULL,
    badge_name TEXT NOT NULL,
    badge_emoji TEXT NOT NULL,
    badge_description TEXT,
    group_id UUID REFERENCES groups(id),
    earned_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, badge_type, group_id)
);

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Leaderboard view
CREATE OR REPLACE VIEW leaderboard AS
SELECT gm.id AS member_id, gm.group_id, u.wallet_address, u.username, u.avatar_emoji,
  gm.total_deposited, gm.deposit_count, gm.streak_count, gm.is_active,
  ROW_NUMBER() OVER (PARTITION BY gm.group_id ORDER BY gm.total_deposited DESC) AS rank
FROM group_members gm JOIN users u ON gm.user_id = u.id WHERE gm.is_active = true;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_groups_creator ON groups(creator_id);
CREATE INDEX IF NOT EXISTS idx_groups_status ON groups(status);
CREATE INDEX IF NOT EXISTS idx_group_members_group_user ON group_members(group_id, user_id);
CREATE INDEX IF NOT EXISTS idx_deposits_group_member ON deposits(group_id, member_id);
CREATE INDEX IF NOT EXISTS idx_microloans_member ON microloans(member_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read);

-- RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE microloans ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_all ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY groups_all ON groups FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY members_all ON group_members FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY deposits_all ON deposits FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY loans_all ON microloans FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY achievements_all ON achievements FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY notifications_all ON notifications FOR ALL USING (true) WITH CHECK (true);

-- Auto updated_at
CREATE OR REPLACE FUNCTION update_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER groups_updated_at BEFORE UPDATE ON groups FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto achievements on deposit
CREATE OR REPLACE FUNCTION check_achievements() RETURNS TRIGGER AS $$
DECLARE v_user_id UUID; v_count INT; v_total BIGINT;
BEGIN
  SELECT gm.user_id, gm.deposit_count, gm.total_deposited INTO v_user_id, v_count, v_total FROM group_members gm WHERE gm.id = NEW.member_id;
  IF v_count = 1 THEN INSERT INTO achievements (user_id, badge_type, badge_name, badge_emoji, badge_description, group_id) VALUES (v_user_id, 'first_deposit', 'First Deposit', '🥇', 'Made your first deposit!', NEW.group_id) ON CONFLICT DO NOTHING; END IF;
  IF v_count >= 3 THEN INSERT INTO achievements (user_id, badge_type, badge_name, badge_emoji, badge_description, group_id) VALUES (v_user_id, '3month_streak', '3-Month Streak', '🔥', 'Saved for 3 months!', NEW.group_id) ON CONFLICT DO NOTHING; END IF;
  IF v_total >= 100000000 THEN INSERT INTO achievements (user_id, badge_type, badge_name, badge_emoji, badge_description, group_id) VALUES (v_user_id, '100m_saved', '100M Club', '💰', 'Saved over Rp 100M!', NEW.group_id) ON CONFLICT DO NOTHING; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER deposits_achievements AFTER INSERT ON deposits FOR EACH ROW WHEN (NEW.status = 'confirmed') EXECUTE FUNCTION check_achievements();
