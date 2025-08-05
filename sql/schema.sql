--
-- PostgreSQL database dump
--

-- Dumped from database version 15.13
-- Dumped by pg_dump version 15.13

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: bank_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bank_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    account_number character varying(255) NOT NULL,
    bank_code character varying(255) NOT NULL,
    bank_name character varying(255) NOT NULL,
    account_name character varying(255) NOT NULL,
    account_type text NOT NULL,
    currency character varying(255) NOT NULL,
    is_verified boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT bank_accounts_account_type_check CHECK ((account_type = ANY (ARRAY['savings'::text, 'checking'::text, 'current'::text])))
);


--
-- Name: bank_deposit_references; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bank_deposit_references (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    reference_code character varying(50) NOT NULL,
    amount numeric(20,2) NOT NULL,
    currency character varying(10),
    status character varying(20) DEFAULT 'pending'::character varying,
    bank_account_id character varying(100) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    expires_at timestamp with time zone NOT NULL,
    processed_at timestamp with time zone
);


--
-- Name: bank_integrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bank_integrations (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    bank_name character varying(100) NOT NULL,
    bank_code character varying(20) NOT NULL,
    swift_code character varying(20),
    country_code character varying(5) NOT NULL,
    api_key character varying(255) NOT NULL,
    api_secret character varying(255) NOT NULL,
    integration_settings jsonb DEFAULT '{}'::jsonb,
    is_active boolean DEFAULT true,
    supports_b2b boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: bank_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bank_transactions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    transaction_id uuid NOT NULL,
    sender_bank_id uuid NOT NULL,
    recipient_bank_id uuid NOT NULL,
    amount numeric(20,8) NOT NULL,
    source_currency character varying(10) NOT NULL,
    target_currency character varying(10) NOT NULL,
    status character varying(20) DEFAULT 'initiated'::character varying NOT NULL,
    exchange_rate numeric(20,8) NOT NULL,
    fee numeric(20,8) NOT NULL,
    settled_amount numeric(20,8),
    reference character varying(100) NOT NULL,
    failure_reason character varying(255),
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: bank_transactions_proxy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bank_transactions_proxy (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    transaction_id uuid NOT NULL,
    sender_bank_id character varying(255) NOT NULL,
    recipient_bank_id character varying(255) NOT NULL,
    amount numeric(20,8) NOT NULL,
    source_currency character varying(10),
    target_currency character varying(10),
    status text DEFAULT 'initiated'::text NOT NULL,
    exchange_rate numeric(20,8) NOT NULL,
    fee numeric(20,8) NOT NULL,
    settled_amount numeric(20,8),
    reference character varying(255) NOT NULL,
    failure_reason character varying(255),
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT bank_transactions_proxy_status_check CHECK ((status = ANY (ARRAY['initiated'::text, 'processing'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])))
);


--
-- Name: exchange_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exchange_rates (
    id integer NOT NULL,
    from_currency character varying(10),
    to_currency character varying(10),
    rate numeric(20,6) NOT NULL,
    fee_percentage numeric(10,4) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: exchange_rates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.exchange_rates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: exchange_rates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.exchange_rates_id_seq OWNED BY public.exchange_rates.id;


--
-- Name: fraud_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fraud_alerts (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    transaction_id uuid NOT NULL,
    risk_score integer NOT NULL,
    risk_level character varying(20) NOT NULL,
    risk_factors json,
    status character varying(20) DEFAULT 'open'::character varying NOT NULL,
    resolution text,
    resolved_by uuid,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: knex_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knex_migrations (
    id integer NOT NULL,
    name character varying(255),
    batch integer,
    migration_time timestamp with time zone
);


--
-- Name: knex_migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.knex_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: knex_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.knex_migrations_id_seq OWNED BY public.knex_migrations.id;


--
-- Name: knex_migrations_lock; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knex_migrations_lock (
    index integer NOT NULL,
    is_locked integer
);


--
-- Name: knex_migrations_lock_index_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.knex_migrations_lock_index_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: knex_migrations_lock_index_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.knex_migrations_lock_index_seq OWNED BY public.knex_migrations_lock.index;


--
-- Name: liquidity_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.liquidity_alerts (
    id uuid NOT NULL,
    pool_id uuid NOT NULL,
    currency character varying(10) NOT NULL,
    level character varying(20) NOT NULL,
    message character varying(255) NOT NULL,
    current_balance numeric(24,8) NOT NULL,
    target_balance numeric(24,8) NOT NULL,
    percent_of_target numeric(24,8) NOT NULL,
    is_resolved boolean DEFAULT false NOT NULL,
    resolution character varying(255),
    resolved_by uuid,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL
);


--
-- Name: liquidity_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.liquidity_movements (
    id uuid NOT NULL,
    pool_id uuid NOT NULL,
    amount numeric(24,8) NOT NULL,
    previous_balance numeric(24,8) NOT NULL,
    new_balance numeric(24,8) NOT NULL,
    reason character varying(255) NOT NULL,
    transaction_id uuid,
    created_at timestamp with time zone NOT NULL
);


--
-- Name: liquidity_pools; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.liquidity_pools (
    id uuid NOT NULL,
    currency character varying(10) NOT NULL,
    target_balance numeric(24,8) NOT NULL,
    current_balance numeric(24,8) DEFAULT '0'::numeric NOT NULL,
    min_threshold numeric(24,8) NOT NULL,
    max_threshold numeric(24,8) NOT NULL,
    usd_rate numeric(24,8) DEFAULT '1'::numeric NOT NULL,
    rebalance_frequency_hours integer DEFAULT 24 NOT NULL,
    last_rebalance_at timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: liquidity_rebalances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.liquidity_rebalances (
    id uuid NOT NULL,
    action_type character varying(20) NOT NULL,
    from_currency character varying(10),
    to_currency character varying(10),
    amount numeric(24,8) NOT NULL,
    executed_by uuid,
    execution_result json,
    created_at timestamp with time zone NOT NULL
);


--
-- Name: payment_route_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_route_events (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    route_id character varying(255) NOT NULL,
    provider character varying(100) NOT NULL,
    corridor_key character varying(100) NOT NULL,
    success boolean NOT NULL,
    duration_ms integer NOT NULL,
    failure_reason text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: phone_wallet_mapping; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.phone_wallet_mapping (
    phone_number character varying(255) NOT NULL,
    user_id uuid NOT NULL,
    wallet_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: saved_recipients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saved_recipients (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    recipient_phone character varying(255) NOT NULL,
    recipient_name character varying(255),
    country_code character varying(2) NOT NULL,
    is_favorite boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    last_used_at timestamp with time zone
);


--
-- Name: transaction_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transaction_events (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    transaction_id uuid NOT NULL,
    event_type character varying(255) NOT NULL,
    event_data jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: transaction_retries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transaction_retries (
    id uuid NOT NULL,
    transaction_id uuid NOT NULL,
    retry_count integer DEFAULT 0 NOT NULL,
    next_retry_time timestamp with time zone NOT NULL,
    failure_reason text,
    failure_type character varying(50),
    status character varying(20) NOT NULL,
    processing_started_at timestamp with time zone,
    completed_at timestamp with time zone,
    result json,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sender_id uuid,
    recipient_id uuid,
    sender_phone character varying(255),
    recipient_phone character varying(255),
    amount numeric(20,2) NOT NULL,
    currency_from character varying(10),
    currency_to character varying(10),
    exchange_rate numeric(20,6) NOT NULL,
    fee numeric(20,2) NOT NULL,
    status text DEFAULT 'pending'::text,
    transaction_type text NOT NULL,
    reference character varying(255),
    metadata jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    completed_at timestamp with time zone,
    processing_started_at timestamp with time zone,
    failed_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    refunded_at timestamp with time zone,
    failure_reason character varying(255),
    cancellation_reason character varying(255),
    transaction_hash character varying(255),
    routing_info jsonb,
    is_test boolean DEFAULT false,
    retry_count integer DEFAULT 0,
    last_retry_at timestamp with time zone,
    reference_id character varying(255),
    source_currency character varying(10),
    target_currency character varying(10),
    updated_at timestamp without time zone,
    sender_country_code character varying(3),
    recipient_country_code character varying(3),
    CONSTRAINT transactions_status_check CHECK ((status = ANY (ARRAY['initiated'::text, 'processing'::text, 'completed'::text, 'failed'::text, 'cancelled'::text, 'refunded'::text]))),
    CONSTRAINT transactions_transaction_type_check CHECK ((transaction_type = ANY (ARRAY['app_transfer'::text, 'deposit'::text, 'withdrawal'::text, 'mint'::text, 'burn'::text, 'bank_to_bank'::text])))
);


--
-- Name: user_devices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_devices (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    device_fingerprint character varying(255) NOT NULL,
    device_name character varying(100),
    device_info json,
    is_trusted boolean DEFAULT false,
    created_at timestamp with time zone NOT NULL,
    last_used timestamp with time zone NOT NULL
);


--
-- Name: user_logins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_logins (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    ip_address character varying(45),
    device_fingerprint character varying(255),
    country_code character varying(2),
    city character varying(100),
    success boolean NOT NULL,
    failure_reason character varying(100),
    user_agent_data json,
    created_at timestamp with time zone NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    phone_number character varying(255) NOT NULL,
    country_code character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    first_name character varying(255),
    last_name character varying(255),
    kyc_status text DEFAULT 'pending'::text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    deleted_at timestamp with time zone,
    transaction_pin_hash character varying(255),
    pin_enabled boolean DEFAULT false,
    pin_created_at timestamp with time zone,
    pin_last_used timestamp with time zone,
    pin_failed_attempts integer DEFAULT 0,
    pin_locked_until timestamp with time zone,
    CONSTRAINT users_kyc_status_check CHECK ((kyc_status = ANY (ARRAY['pending'::text, 'verified'::text, 'rejected'::text])))
);


--
-- Name: wallets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wallets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    balance_ngn numeric(20,2) DEFAULT '0'::numeric NOT NULL,
    balance_gbp numeric(20,2) DEFAULT '0'::numeric NOT NULL,
    balance_usd numeric(20,2) DEFAULT '0'::numeric NOT NULL,
    cbusd_balance numeric(20,2) DEFAULT '0'::numeric NOT NULL,
    wallet_address character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone
);


--
-- Name: webhook_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_type character varying(50) NOT NULL,
    reference_code character varying(50),
    amount numeric(20,2),
    currency character varying(3),
    bank_reference character varying(100),
    raw_data jsonb,
    processed boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: exchange_rates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_rates ALTER COLUMN id SET DEFAULT nextval('public.exchange_rates_id_seq'::regclass);


--
-- Name: knex_migrations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knex_migrations ALTER COLUMN id SET DEFAULT nextval('public.knex_migrations_id_seq'::regclass);


--
-- Name: knex_migrations_lock index; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knex_migrations_lock ALTER COLUMN index SET DEFAULT nextval('public.knex_migrations_lock_index_seq'::regclass);


--
-- Name: bank_accounts bank_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_accounts
    ADD CONSTRAINT bank_accounts_pkey PRIMARY KEY (id);


--
-- Name: bank_accounts bank_accounts_user_id_account_number_bank_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_accounts
    ADD CONSTRAINT bank_accounts_user_id_account_number_bank_code_unique UNIQUE (user_id, account_number, bank_code);


--
-- Name: bank_deposit_references bank_deposit_references_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_deposit_references
    ADD CONSTRAINT bank_deposit_references_pkey PRIMARY KEY (id);


--
-- Name: bank_deposit_references bank_deposit_references_reference_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_deposit_references
    ADD CONSTRAINT bank_deposit_references_reference_code_key UNIQUE (reference_code);


--
-- Name: bank_integrations bank_integrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_integrations
    ADD CONSTRAINT bank_integrations_pkey PRIMARY KEY (id);


--
-- Name: bank_transactions bank_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_transactions
    ADD CONSTRAINT bank_transactions_pkey PRIMARY KEY (id);


--
-- Name: bank_transactions_proxy bank_transactions_proxy_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_transactions_proxy
    ADD CONSTRAINT bank_transactions_proxy_pkey PRIMARY KEY (id);


--
-- Name: exchange_rates exchange_rates_from_currency_to_currency_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_rates
    ADD CONSTRAINT exchange_rates_from_currency_to_currency_unique UNIQUE (from_currency, to_currency);


--
-- Name: exchange_rates exchange_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_rates
    ADD CONSTRAINT exchange_rates_pkey PRIMARY KEY (id);


--
-- Name: fraud_alerts fraud_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fraud_alerts
    ADD CONSTRAINT fraud_alerts_pkey PRIMARY KEY (id);


--
-- Name: knex_migrations_lock knex_migrations_lock_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knex_migrations_lock
    ADD CONSTRAINT knex_migrations_lock_pkey PRIMARY KEY (index);


--
-- Name: knex_migrations knex_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knex_migrations
    ADD CONSTRAINT knex_migrations_pkey PRIMARY KEY (id);


--
-- Name: liquidity_alerts liquidity_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.liquidity_alerts
    ADD CONSTRAINT liquidity_alerts_pkey PRIMARY KEY (id);


--
-- Name: liquidity_movements liquidity_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.liquidity_movements
    ADD CONSTRAINT liquidity_movements_pkey PRIMARY KEY (id);


--
-- Name: liquidity_pools liquidity_pools_currency_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.liquidity_pools
    ADD CONSTRAINT liquidity_pools_currency_unique UNIQUE (currency);


--
-- Name: liquidity_pools liquidity_pools_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.liquidity_pools
    ADD CONSTRAINT liquidity_pools_pkey PRIMARY KEY (id);


--
-- Name: liquidity_rebalances liquidity_rebalances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.liquidity_rebalances
    ADD CONSTRAINT liquidity_rebalances_pkey PRIMARY KEY (id);


--
-- Name: payment_route_events payment_route_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_route_events
    ADD CONSTRAINT payment_route_events_pkey PRIMARY KEY (id);


--
-- Name: phone_wallet_mapping phone_wallet_mapping_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.phone_wallet_mapping
    ADD CONSTRAINT phone_wallet_mapping_pkey PRIMARY KEY (phone_number);


--
-- Name: saved_recipients saved_recipients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_recipients
    ADD CONSTRAINT saved_recipients_pkey PRIMARY KEY (id);


--
-- Name: saved_recipients saved_recipients_user_id_recipient_phone_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_recipients
    ADD CONSTRAINT saved_recipients_user_id_recipient_phone_unique UNIQUE (user_id, recipient_phone);


--
-- Name: transaction_events transaction_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transaction_events
    ADD CONSTRAINT transaction_events_pkey PRIMARY KEY (id);


--
-- Name: transaction_retries transaction_retries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transaction_retries
    ADD CONSTRAINT transaction_retries_pkey PRIMARY KEY (id);


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);


--
-- Name: transactions transactions_reference_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_reference_unique UNIQUE (reference);


--
-- Name: user_devices user_devices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_devices
    ADD CONSTRAINT user_devices_pkey PRIMARY KEY (id);


--
-- Name: user_devices user_devices_user_id_device_fingerprint_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_devices
    ADD CONSTRAINT user_devices_user_id_device_fingerprint_unique UNIQUE (user_id, device_fingerprint);


--
-- Name: user_logins user_logins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_logins
    ADD CONSTRAINT user_logins_pkey PRIMARY KEY (id);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_phone_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_phone_number_unique UNIQUE (phone_number);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: wallets wallets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallets
    ADD CONSTRAINT wallets_pkey PRIMARY KEY (id);


--
-- Name: wallets wallets_wallet_address_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallets
    ADD CONSTRAINT wallets_wallet_address_unique UNIQUE (wallet_address);


--
-- Name: webhook_events webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_events
    ADD CONSTRAINT webhook_events_pkey PRIMARY KEY (id);


--
-- Name: bank_transactions_proxy_recipient_bank_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bank_transactions_proxy_recipient_bank_id_index ON public.bank_transactions_proxy USING btree (recipient_bank_id);


--
-- Name: bank_transactions_proxy_reference_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bank_transactions_proxy_reference_index ON public.bank_transactions_proxy USING btree (reference);


--
-- Name: bank_transactions_proxy_sender_bank_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bank_transactions_proxy_sender_bank_id_index ON public.bank_transactions_proxy USING btree (sender_bank_id);


--
-- Name: bank_transactions_proxy_status_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bank_transactions_proxy_status_index ON public.bank_transactions_proxy USING btree (status);


--
-- Name: bank_transactions_proxy_transaction_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bank_transactions_proxy_transaction_id_index ON public.bank_transactions_proxy USING btree (transaction_id);


--
-- Name: fraud_alerts_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fraud_alerts_created_at_index ON public.fraud_alerts USING btree (created_at);


--
-- Name: fraud_alerts_risk_level_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fraud_alerts_risk_level_index ON public.fraud_alerts USING btree (risk_level);


--
-- Name: fraud_alerts_status_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fraud_alerts_status_index ON public.fraud_alerts USING btree (status);


--
-- Name: fraud_alerts_transaction_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fraud_alerts_transaction_id_index ON public.fraud_alerts USING btree (transaction_id);


--
-- Name: fraud_alerts_user_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fraud_alerts_user_id_index ON public.fraud_alerts USING btree (user_id);


--
-- Name: idx_users_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_deleted_at ON public.users USING btree (deleted_at);


--
-- Name: liquidity_alerts_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX liquidity_alerts_created_at_index ON public.liquidity_alerts USING btree (created_at);


--
-- Name: liquidity_alerts_currency_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX liquidity_alerts_currency_index ON public.liquidity_alerts USING btree (currency);


--
-- Name: liquidity_alerts_is_resolved_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX liquidity_alerts_is_resolved_index ON public.liquidity_alerts USING btree (is_resolved);


--
-- Name: liquidity_alerts_level_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX liquidity_alerts_level_index ON public.liquidity_alerts USING btree (level);


--
-- Name: liquidity_alerts_pool_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX liquidity_alerts_pool_id_index ON public.liquidity_alerts USING btree (pool_id);


--
-- Name: liquidity_movements_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX liquidity_movements_created_at_index ON public.liquidity_movements USING btree (created_at);


--
-- Name: liquidity_movements_pool_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX liquidity_movements_pool_id_index ON public.liquidity_movements USING btree (pool_id);


--
-- Name: liquidity_movements_transaction_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX liquidity_movements_transaction_id_index ON public.liquidity_movements USING btree (transaction_id);


--
-- Name: liquidity_pools_currency_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX liquidity_pools_currency_index ON public.liquidity_pools USING btree (currency);


--
-- Name: liquidity_pools_is_active_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX liquidity_pools_is_active_index ON public.liquidity_pools USING btree (is_active);


--
-- Name: liquidity_rebalances_action_type_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX liquidity_rebalances_action_type_index ON public.liquidity_rebalances USING btree (action_type);


--
-- Name: liquidity_rebalances_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX liquidity_rebalances_created_at_index ON public.liquidity_rebalances USING btree (created_at);


--
-- Name: liquidity_rebalances_from_currency_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX liquidity_rebalances_from_currency_index ON public.liquidity_rebalances USING btree (from_currency);


--
-- Name: liquidity_rebalances_to_currency_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX liquidity_rebalances_to_currency_index ON public.liquidity_rebalances USING btree (to_currency);


--
-- Name: payment_route_events_corridor_key_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payment_route_events_corridor_key_index ON public.payment_route_events USING btree (corridor_key);


--
-- Name: payment_route_events_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payment_route_events_created_at_index ON public.payment_route_events USING btree (created_at);


--
-- Name: payment_route_events_provider_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payment_route_events_provider_index ON public.payment_route_events USING btree (provider);


--
-- Name: payment_route_events_success_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payment_route_events_success_index ON public.payment_route_events USING btree (success);


--
-- Name: phone_wallet_mapping_phone_number_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX phone_wallet_mapping_phone_number_index ON public.phone_wallet_mapping USING btree (phone_number);


--
-- Name: saved_recipients_recipient_phone_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX saved_recipients_recipient_phone_index ON public.saved_recipients USING btree (recipient_phone);


--
-- Name: saved_recipients_user_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX saved_recipients_user_id_index ON public.saved_recipients USING btree (user_id);


--
-- Name: transaction_events_event_type_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transaction_events_event_type_index ON public.transaction_events USING btree (event_type);


--
-- Name: transaction_events_transaction_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transaction_events_transaction_id_index ON public.transaction_events USING btree (transaction_id);


--
-- Name: transaction_retries_next_retry_time_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transaction_retries_next_retry_time_index ON public.transaction_retries USING btree (next_retry_time);


--
-- Name: transaction_retries_status_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transaction_retries_status_index ON public.transaction_retries USING btree (status);


--
-- Name: transaction_retries_transaction_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transaction_retries_transaction_id_index ON public.transaction_retries USING btree (transaction_id);


--
-- Name: transactions_recipient_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transactions_recipient_id_index ON public.transactions USING btree (recipient_id);


--
-- Name: transactions_sender_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transactions_sender_id_index ON public.transactions USING btree (sender_id);


--
-- Name: transactions_sender_phone_recipient_phone_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transactions_sender_phone_recipient_phone_index ON public.transactions USING btree (sender_phone, recipient_phone);


--
-- Name: transactions_status_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transactions_status_index ON public.transactions USING btree (status);


--
-- Name: transactions_transaction_type_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transactions_transaction_type_index ON public.transactions USING btree (transaction_type);


--
-- Name: user_devices_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_devices_created_at_index ON public.user_devices USING btree (created_at);


--
-- Name: user_devices_device_fingerprint_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_devices_device_fingerprint_index ON public.user_devices USING btree (device_fingerprint);


--
-- Name: user_devices_user_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_devices_user_id_index ON public.user_devices USING btree (user_id);


--
-- Name: user_logins_country_code_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_logins_country_code_index ON public.user_logins USING btree (country_code);


--
-- Name: user_logins_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_logins_created_at_index ON public.user_logins USING btree (created_at);


--
-- Name: user_logins_device_fingerprint_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_logins_device_fingerprint_index ON public.user_logins USING btree (device_fingerprint);


--
-- Name: user_logins_ip_address_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_logins_ip_address_index ON public.user_logins USING btree (ip_address);


--
-- Name: user_logins_success_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_logins_success_index ON public.user_logins USING btree (success);


--
-- Name: user_logins_user_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_logins_user_id_index ON public.user_logins USING btree (user_id);


--
-- Name: users_phone_number_country_code_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_phone_number_country_code_index ON public.users USING btree (phone_number, country_code);


--
-- Name: wallets_wallet_address_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wallets_wallet_address_index ON public.wallets USING btree (wallet_address);


--
-- Name: bank_accounts bank_accounts_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_accounts
    ADD CONSTRAINT bank_accounts_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: bank_transactions_proxy bank_transactions_proxy_transaction_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_transactions_proxy
    ADD CONSTRAINT bank_transactions_proxy_transaction_id_foreign FOREIGN KEY (transaction_id) REFERENCES public.transactions(id) ON DELETE CASCADE;


--
-- Name: bank_transactions bank_transactions_transaction_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_transactions
    ADD CONSTRAINT bank_transactions_transaction_id_foreign FOREIGN KEY (transaction_id) REFERENCES public.transactions(id);


--
-- Name: bank_deposit_references fk_bank_deposit_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_deposit_references
    ADD CONSTRAINT fk_bank_deposit_user FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: fraud_alerts fraud_alerts_transaction_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fraud_alerts
    ADD CONSTRAINT fraud_alerts_transaction_id_foreign FOREIGN KEY (transaction_id) REFERENCES public.transactions(id) ON DELETE CASCADE;


--
-- Name: fraud_alerts fraud_alerts_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fraud_alerts
    ADD CONSTRAINT fraud_alerts_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: liquidity_alerts liquidity_alerts_pool_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.liquidity_alerts
    ADD CONSTRAINT liquidity_alerts_pool_id_foreign FOREIGN KEY (pool_id) REFERENCES public.liquidity_pools(id) ON DELETE CASCADE;


--
-- Name: liquidity_movements liquidity_movements_pool_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.liquidity_movements
    ADD CONSTRAINT liquidity_movements_pool_id_foreign FOREIGN KEY (pool_id) REFERENCES public.liquidity_pools(id) ON DELETE CASCADE;


--
-- Name: phone_wallet_mapping phone_wallet_mapping_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.phone_wallet_mapping
    ADD CONSTRAINT phone_wallet_mapping_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: phone_wallet_mapping phone_wallet_mapping_wallet_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.phone_wallet_mapping
    ADD CONSTRAINT phone_wallet_mapping_wallet_id_foreign FOREIGN KEY (wallet_id) REFERENCES public.wallets(id) ON DELETE CASCADE;


--
-- Name: saved_recipients saved_recipients_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_recipients
    ADD CONSTRAINT saved_recipients_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: transaction_events transaction_events_transaction_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transaction_events
    ADD CONSTRAINT transaction_events_transaction_id_foreign FOREIGN KEY (transaction_id) REFERENCES public.transactions(id) ON DELETE CASCADE;


--
-- Name: transaction_retries transaction_retries_transaction_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transaction_retries
    ADD CONSTRAINT transaction_retries_transaction_id_foreign FOREIGN KEY (transaction_id) REFERENCES public.transactions(id) ON DELETE CASCADE;


--
-- Name: transactions transactions_recipient_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_recipient_id_foreign FOREIGN KEY (recipient_id) REFERENCES public.users(id);


--
-- Name: transactions transactions_sender_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_sender_id_foreign FOREIGN KEY (sender_id) REFERENCES public.users(id);


--
-- Name: user_devices user_devices_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_devices
    ADD CONSTRAINT user_devices_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_logins user_logins_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_logins
    ADD CONSTRAINT user_logins_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: wallets wallets_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallets
    ADD CONSTRAINT wallets_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

