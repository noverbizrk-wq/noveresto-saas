-- ══════════════════════════════════════════════════════════════════════════════
-- NoveResto — Migrations PostgreSQL Module Social Media IA
-- Version : 1.0.0 — Juillet 2026
-- Exécuter sur le serveur : docker exec -i noveresto_db psql -U noveresto -d noveresto < social-db-migrations.sql
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. Comptes sociaux connectés
CREATE TABLE IF NOT EXISTS social_accounts (
  id                    SERIAL PRIMARY KEY,
  restaurant_id         INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  platform              VARCHAR(20) NOT NULL CHECK (platform IN ('facebook','instagram','tiktok')),
  account_id            VARCHAR(255) NOT NULL,
  account_name          VARCHAR(255),
  page_id               VARCHAR(255),
  instagram_business_id VARCHAR(255),
  access_token          TEXT NOT NULL,
  refresh_token         TEXT,
  token_expires_at      TIMESTAMP,
  status                VARCHAR(20) DEFAULT 'connected' CHECK (status IN ('connected','expired','error','revoked')),
  permissions           TEXT[],
  created_at            TIMESTAMP DEFAULT NOW(),
  updated_at            TIMESTAMP DEFAULT NOW(),
  UNIQUE(restaurant_id, platform)
);

-- 2. Profil marketing du restaurant (pour l'IA)
CREATE TABLE IF NOT EXISTS restaurant_social_profiles (
  id                    SERIAL PRIMARY KEY,
  restaurant_id         INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE UNIQUE,
  cuisine_type          VARCHAR(100),
  specialties           TEXT,
  target_audience       VARCHAR(255),
  target_age            VARCHAR(50),
  positioning           VARCHAR(100),
  differentiators       TEXT,
  is_halal              BOOLEAN DEFAULT FALSE,
  has_delivery          BOOLEAN DEFAULT FALSE,
  has_booking           BOOLEAN DEFAULT FALSE,
  top_dishes            TEXT[],
  profitable_dishes     TEXT[],
  slow_days             TEXT[],
  objectives            TEXT[],
  competitors           TEXT[],
  brand_voice           JSONB,
  hashtag_strategy      JSONB,
  formula               VARCHAR(20) DEFAULT 'croissance' CHECK (formula IN ('essentielle','croissance','performance')),
  validation_mode       VARCHAR(20) DEFAULT 'monthly' CHECK (validation_mode IN ('full','monthly','auto')),
  active_platforms      TEXT[] DEFAULT ARRAY['facebook','instagram','tiktok'],
  created_at            TIMESTAMP DEFAULT NOW(),
  updated_at            TIMESTAMP DEFAULT NOW()
);

-- 3. Calendriers éditoriaux
CREATE TABLE IF NOT EXISTS editorial_calendars (
  id                    SERIAL PRIMARY KEY,
  restaurant_id         INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  month                 DATE NOT NULL,
  formula               VARCHAR(20),
  status                VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft','pending_validation','validated','active','completed')),
  generated_by_ai       BOOLEAN DEFAULT TRUE,
  ai_strategy_used      JSONB,
  validated_by          INTEGER REFERENCES users(id),
  validated_at          TIMESTAMP,
  created_at            TIMESTAMP DEFAULT NOW(),
  UNIQUE(restaurant_id, month)
);

-- 4. Publications
CREATE TABLE IF NOT EXISTS social_posts (
  id                    SERIAL PRIMARY KEY,
  calendar_id           INTEGER REFERENCES editorial_calendars(id),
  restaurant_id         INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  platform              VARCHAR(20) NOT NULL CHECK (platform IN ('facebook','instagram','tiktok')),
  scheduled_at          TIMESTAMP NOT NULL,
  content_type          VARCHAR(30) DEFAULT 'post',
  theme                 VARCHAR(50),
  objective             VARCHAR(50),
  caption_hook          TEXT,
  caption_body          TEXT,
  caption_full          TEXT NOT NULL,
  cta                   VARCHAR(200),
  hashtags              TEXT[],
  visual_suggestion     TEXT,
  media_urls            TEXT[],
  status                VARCHAR(30) DEFAULT 'draft' CHECK (status IN ('draft','pending_validation','validated','scheduled','publishing','published','failed','cancelled')),
  platform_post_id      VARCHAR(255),
  published_at          TIMESTAMP,
  error_message         TEXT,
  retry_count           INTEGER DEFAULT 0,
  is_sponsored          BOOLEAN DEFAULT FALSE,
  ai_generated          BOOLEAN DEFAULT TRUE,
  validated_by          INTEGER REFERENCES users(id),
  validated_at          TIMESTAMP,
  created_at            TIMESTAMP DEFAULT NOW(),
  updated_at            TIMESTAMP DEFAULT NOW()
);

-- 5. Campagnes publicitaires
CREATE TABLE IF NOT EXISTS ad_campaigns (
  id                    SERIAL PRIMARY KEY,
  restaurant_id         INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  platform              VARCHAR(20) NOT NULL,
  name                  VARCHAR(255) NOT NULL,
  objective             VARCHAR(50),
  budget_total          DECIMAL(10,2) NOT NULL,
  budget_daily          DECIMAL(10,2),
  spent_total           DECIMAL(10,2) DEFAULT 0,
  starts_at             DATE,
  ends_at               DATE,
  target_age_min        INTEGER DEFAULT 18,
  target_age_max        INTEGER DEFAULT 65,
  target_radius_km      INTEGER DEFAULT 5,
  target_interests      TEXT[],
  offer                 TEXT,
  creative_headline     VARCHAR(255),
  creative_text         TEXT,
  creative_cta          VARCHAR(50),
  media_url             TEXT,
  status                VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft','pending_validation','active','paused','completed','cancelled')),
  platform_campaign_id  VARCHAR(255),
  platform_adset_id     VARCHAR(255),
  platform_ad_id        VARCHAR(255),
  validation_statement  TEXT,
  validated_by          INTEGER REFERENCES users(id),
  validated_at          TIMESTAMP,
  ai_proposal           JSONB,
  created_at            TIMESTAMP DEFAULT NOW(),
  updated_at            TIMESTAMP DEFAULT NOW()
);

-- 6. Analytics par publication
CREATE TABLE IF NOT EXISTS post_analytics (
  id                    SERIAL PRIMARY KEY,
  post_id               INTEGER NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  collected_at          TIMESTAMP DEFAULT NOW(),
  impressions           INTEGER DEFAULT 0,
  reach                 INTEGER DEFAULT 0,
  likes                 INTEGER DEFAULT 0,
  comments              INTEGER DEFAULT 0,
  shares                INTEGER DEFAULT 0,
  saves                 INTEGER DEFAULT 0,
  clicks                INTEGER DEFAULT 0,
  video_views           INTEGER DEFAULT 0,
  video_completion_rate DECIMAL(5,2),
  engagement_rate       DECIMAL(5,2),
  UNIQUE(post_id, collected_at::date)
);

-- 7. Commentaires et messages
CREATE TABLE IF NOT EXISTS social_comments (
  id                    SERIAL PRIMARY KEY,
  restaurant_id         INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  post_id               INTEGER REFERENCES social_posts(id),
  platform              VARCHAR(20) NOT NULL,
  platform_comment_id   VARCHAR(255) UNIQUE,
  author_name           VARCHAR(255),
  author_id             VARCHAR(255),
  text                  TEXT NOT NULL,
  sentiment             VARCHAR(20) DEFAULT 'neutral' CHECK (sentiment IN ('positive','negative','neutral','urgent')),
  classification        VARCHAR(30),
  urgency_level         VARCHAR(20) DEFAULT 'low' CHECK (urgency_level IN ('low','medium','high','critical')),
  requires_human        BOOLEAN DEFAULT FALSE,
  ai_suggested_reply    TEXT,
  replied_text          TEXT,
  replied_at            TIMESTAMP,
  replied_by            VARCHAR(20) DEFAULT 'pending' CHECK (replied_by IN ('ai','human','pending','ignored')),
  is_hidden             BOOLEAN DEFAULT FALSE,
  received_at           TIMESTAMP DEFAULT NOW(),
  created_at            TIMESTAMP DEFAULT NOW()
);

-- 8. Utilisation tokens Claude API
CREATE TABLE IF NOT EXISTS social_token_usage (
  id                    SERIAL PRIMARY KEY,
  restaurant_id         INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  month                 VARCHAR(7) NOT NULL,
  tokens_used           INTEGER DEFAULT 0,
  function_name         VARCHAR(100),
  created_at            TIMESTAMP DEFAULT NOW(),
  UNIQUE(restaurant_id, month, function_name)
);

-- 9. Journal d'audit social media
CREATE TABLE IF NOT EXISTS social_audit_log (
  id                    SERIAL PRIMARY KEY,
  restaurant_id         INTEGER REFERENCES restaurants(id),
  user_id               INTEGER REFERENCES users(id),
  action                VARCHAR(100) NOT NULL,
  entity_type           VARCHAR(50),
  entity_id             INTEGER,
  platform              VARCHAR(20),
  details               JSONB,
  ip_address            INET,
  result                VARCHAR(20) DEFAULT 'success' CHECK (result IN ('success','error','pending')),
  error_message         TEXT,
  created_at            TIMESTAMP DEFAULT NOW()
);

-- ── INDEX POUR PERFORMANCE ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_social_posts_restaurant ON social_posts(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_status ON social_posts(status);
CREATE INDEX IF NOT EXISTS idx_social_posts_scheduled ON social_posts(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_social_posts_platform ON social_posts(platform);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_restaurant ON ad_campaigns(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_status ON ad_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_social_comments_restaurant ON social_comments(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_social_comments_urgency ON social_comments(urgency_level);
CREATE INDEX IF NOT EXISTS idx_social_audit_restaurant ON social_audit_log(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_social_audit_created ON social_audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_token_usage_restaurant_month ON social_token_usage(restaurant_id, month);

-- ── VÉRIFICATION ──────────────────────────────────────────────────────────────
SELECT 'Tables créées:' as info;
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE 'social_%' OR table_name IN ('editorial_calendars','ad_campaigns','post_analytics')
ORDER BY table_name;
