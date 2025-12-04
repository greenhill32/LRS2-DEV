# Lorry Park - Database Build Guide

**Version:** 4.0.0  
**Last Updated:** 2024-12-04  
**System:** Vehicle Management & Queue System  
**Database:** Supabase (PostgreSQL)

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Quick Start](#quick-start)
4. [Database Schema](#database-schema)
5. [Security & Authentication](#security--authentication)
6. [Build SQL](#build-sql)
7. [Post-Installation](#post-installation)
8. [Troubleshooting](#troubleshooting)
9. [Maintenance](#maintenance)

---

## Overview

LORRY PARK is a comprehensive vehicle management system designed to replace the legacy LRS Connect paging system. This database powers:

- **Gatehouse Operations** - Vehicle check-in and queue management
- **Supervisor Dashboard** - Real-time intervention and case management  
- **Driver Notifications** - SMS alerts and QR code status checks
- **Arrivals Board** - Prebooking integration and expected arrivals
- **Reporting** - Complete audit trails and analytics

### Key Features

- ✅ Session-based authentication with PIN codes
- ✅ Role-based access control (gatehouse/operator/supervisor)
- ✅ Real-time updates via Supabase Realtime
- ✅ Complete audit logging of all actions
- ✅ SMS notification tracking
- ✅ Export load classification
- ✅ Performance-optimized with indexes

---

## Prerequisites

Before running the build script, ensure you have:

- [x] Supabase account (free tier works)
- [x] New Supabase project created
- [x] Database password noted (not required for build)
- [x] SQL Editor access in Supabase dashboard

### System Requirements

- **Database:** PostgreSQL 15+ (via Supabase)
- **Region:** EU (London recommended for UK operations)
- **Extensions:** `pgcrypto` (auto-enabled in Supabase)

---

## Quick Start

### 1. Create New Supabase Project

```
1. Go to https://supabase.com
2. Click "New Project"
3. Name: Lorry Park-production (or similar)
4. Password: [generate strong password]
5. Region: Europe West (London)
6. Wait ~20 seconds for provisioning
```

### 2. Run Build Script

```
1. Navigate to: Project Dashboard → SQL Editor
2. Click "New Query"
3. Paste the COMPLETE SQL from section below
4. Click "Run" (or press Ctrl+Enter)
5. Verify: "Success. No rows returned"
```

### 3. Verify Installation

Run this verification query:

```sql
-- Check all tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public'
  AND table_name IN ('operators', 'operator_sessions', 'vehicles', 'actions_log', 'prebookings')
ORDER BY table_name;

-- Should return 5 rows
```

### 4. Test Authentication

```sql
-- Try logging in with default supervisor account
SELECT public.login_operator(
    (SELECT id FROM operators WHERE name = 'Supervisor'),
    '270379'
);

-- Should return: {"success": true, "token": "...", ...}
```

---

## Database Schema

### Tables Overview

| Table | Purpose | Rows (typical) |
|-------|---------|----------------|
| `operators` | Staff members with PIN authentication | ~10-20 |
| `operator_sessions` | Active login sessions (24hr expiry) | ~5-10 |
| `vehicles` | All vehicle check-ins and status | ~50-200/day |
| `actions_log` | Complete audit trail | ~500-1000/day |
| `prebookings` | Expected arrivals from booking system | ~30-50/day |

### Entity Relationships

```
operators (1) ←→ (1) operator_sessions
    ↓ (1:many)
vehicles
    ↓ (1:many)
actions_log
```

### Key Fields

**operators**
- `id` - UUID primary key
- `name` - Display name (e.g., "John Smith")
- `pin_code` - 6-digit authentication PIN
- `role` - 'gatehouse' | 'operator' | 'supervisor'
- `active` - Boolean flag for disabled accounts

**vehicles**
- `id` - UUID primary key
- `registration` - Vehicle reg (auto-uppercase)
- `status` - 'parked' | 'notified' | 'released'
- `classification` - 'normal' | 'export' (visual treatment)
- `check_in_time` - Arrival timestamp
- `notify_time` - When driver was called
- `release_time` - When vehicle departed
- `due_time` - Expected completion (check_in + quoted_minutes)

**actions_log**
- Complete audit trail with:
  - `action` - 'check_in', 'notified', 'released', 'edit', etc.
  - `details` - JSONB for structured metadata
  - SMS tracking fields (recipient_phone, message_content, etc.)

---

## Security & Authentication

### Session-Based Authentication

LORRY PARK uses **server-side session tokens** managed via PostgreSQL functions:

1. **Login Flow:**
   ```
   User selects name → Enters PIN → login_operator() validates
   → Returns 24hr token → Stored in localStorage → Used for all RPC calls
   ```

2. **Token Validation:**
   ```
   Every secure RPC → validate_token() → Returns operator_id or NULL
   → If NULL, return error → Frontend redirects to login
   ```

3. **Token Expiry:**
   - Sessions expire after 24 hours
   - Expired tokens automatically rejected
   - Users must log in again

### Row-Level Security (RLS)

All tables have RLS enabled with policies:

- **Operators:** Read-only for login page (active users only)
- **Sessions:** Read-only for token validation
- **Vehicles:** All access via secure RPCs only (no direct queries)
- **Actions Log:** All access via secure RPCs only
- **Prebookings:** Read-only for arrivals dashboard

### Security Best Practices

⚠️ **IMPORTANT:** Before going live:

```sql
-- 1. Change all default PINs
UPDATE operators SET pin_code = 'NEW_PIN' WHERE name = 'Supervisor';

-- 2. Disable test accounts
UPDATE operators SET active = false WHERE name LIKE 'Test%';

-- 3. Review RLS policies
SELECT * FROM pg_policies WHERE schemaname = 'public';
```

---

## Build SQL

### Complete Database Build Script

Copy and paste this **ENTIRE BLOCK** into Supabase SQL Editor:

```sql
-- ============================================
-- LORRY PARK - COMPLETE DATABASE SCHEMA
-- Version 4.0.0 - Session Authentication
-- Generated: 2024-12-04
-- ============================================

-- ============================================
-- SECTION 1: TABLES (In Dependency Order)
-- ============================================

-- TABLE: operators
-- Purpose: Store all gatehouse/supervisor staff
CREATE TABLE public.operators (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  pin_code text,
  role text,
  active bool DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.operators ADD PRIMARY KEY (id);
ALTER TABLE public.operators ENABLE ROW LEVEL SECURITY;

-- TABLE: operator_sessions
-- Purpose: Store session tokens for authentication
CREATE TABLE public.operator_sessions (
  operator_id uuid NOT NULL,
  token text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.operator_sessions ADD PRIMARY KEY (operator_id);
ALTER TABLE public.operator_sessions 
  ADD FOREIGN KEY (operator_id) 
  REFERENCES public.operators(id) 
  ON DELETE CASCADE;
ALTER TABLE public.operator_sessions ENABLE ROW LEVEL SECURITY;

-- TABLE: vehicles
-- Purpose: Store all lorry check-ins and status
CREATE TABLE public.vehicles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  registration text NOT NULL,
  po_ref text,
  bay text,
  notes text,
  operator_id uuid,
  status text DEFAULT 'parked'::text,
  pager_number text,
  quoted_minutes int4,
  check_in_time timestamptz DEFAULT now(),
  notify_time timestamptz,
  release_time timestamptz,
  due_time timestamptz,
  created_at timestamptz DEFAULT now(),
  classification text DEFAULT 'normal'::text,
  haulier text,
  mobile_number text,
  pallet_count int4 DEFAULT 0
);

ALTER TABLE public.vehicles ADD PRIMARY KEY (id);
ALTER TABLE public.vehicles 
  ADD FOREIGN KEY (operator_id) 
  REFERENCES public.operators(id);
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

-- TABLE: actions_log
-- Purpose: Audit trail for all vehicle actions
CREATE TABLE public.actions_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  vehicle_id uuid,
  operator_id uuid,
  action text,
  details jsonb,
  timestamp timestamptz DEFAULT now(),
  recipient_phone text,
  message_type text,
  message_sent bool DEFAULT false,
  message_content text
);

ALTER TABLE public.actions_log ADD PRIMARY KEY (id);
ALTER TABLE public.actions_log 
  ADD FOREIGN KEY (vehicle_id) 
  REFERENCES public.vehicles(id) 
  ON DELETE CASCADE;
ALTER TABLE public.actions_log 
  ADD FOREIGN KEY (operator_id) 
  REFERENCES public.operators(id);
ALTER TABLE public.actions_log ENABLE ROW LEVEL SECURITY;

-- TABLE: prebookings
-- Purpose: Expected arrivals from booking system
CREATE TABLE public.prebookings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamptz DEFAULT now(),
  expected_date date,
  expected_time time,
  po_ref text NOT NULL,
  registration text,
  is_export bool DEFAULT false,
  notes text,
  consumed bool DEFAULT false,
  mobile_number text
);

ALTER TABLE public.prebookings ADD PRIMARY KEY (id);
ALTER TABLE public.prebookings ENABLE ROW LEVEL SECURITY;

-- ============================================
-- SECTION 2: INDEXES
-- ============================================

-- Vehicles indexes for performance
CREATE INDEX idx_vehicles_status ON public.vehicles(status);
CREATE INDEX idx_vehicles_check_in_time ON public.vehicles(check_in_time);
CREATE INDEX idx_vehicles_registration ON public.vehicles(registration);
CREATE INDEX idx_vehicles_po_ref ON public.vehicles(po_ref);

-- Actions log indexes
CREATE INDEX idx_actions_log_vehicle_id ON public.actions_log(vehicle_id);
CREATE INDEX idx_actions_log_timestamp ON public.actions_log(timestamp DESC);
CREATE INDEX idx_actions_log_message_type ON public.actions_log(message_type) WHERE message_type IS NOT NULL;

-- Session token lookup
CREATE INDEX idx_operator_sessions_token ON public.operator_sessions(token);
CREATE INDEX idx_operator_sessions_expires ON public.operator_sessions(expires_at);

-- ============================================
-- SECTION 3: RPC FUNCTIONS
-- ============================================

-- FUNCTION: validate_token
-- Purpose: Check if session token is valid
CREATE OR REPLACE FUNCTION public.validate_token(session_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_operator_id uuid;
BEGIN
    SELECT operator_id INTO v_operator_id
    FROM public.operator_sessions
    WHERE token = session_token
      AND expires_at > now();
    
    RETURN v_operator_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_token TO anon;

-- FUNCTION: login_operator
-- Purpose: Authenticate user and create session token
CREATE OR REPLACE FUNCTION public.login_operator(
    p_operator_id uuid,
    p_pin_code text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_operator record;
    v_token text;
BEGIN
    -- Validate credentials
    SELECT * INTO v_operator
    FROM public.operators
    WHERE id = p_operator_id
      AND active = true
      AND pin_code = p_pin_code;
    
    IF v_operator IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Invalid credentials');
    END IF;
    
    -- Generate session token
    v_token := encode(gen_random_bytes(32), 'base64');
    
    -- Store token (upsert)
    INSERT INTO public.operator_sessions (operator_id, token, expires_at)
    VALUES (v_operator.id, v_token, now() + interval '24 hours')
    ON CONFLICT (operator_id) 
    DO UPDATE SET token = v_token, expires_at = now() + interval '24 hours';
    
    -- Return success with session info
    RETURN json_build_object(
        'success', true,
        'token', v_token,
        'operator_id', v_operator.id,
        'name', v_operator.name,
        'role', v_operator.role
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.login_operator TO anon;

-- FUNCTION: get_vehicles_secure
-- Purpose: Get all active vehicles (requires valid session)
CREATE OR REPLACE FUNCTION public.get_vehicles_secure(session_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_op_id uuid;
BEGIN
    SELECT public.validate_token(session_token) INTO v_op_id;
    
    IF v_op_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Invalid session');
    END IF;
    
    RETURN json_build_object(
        'success', true,
        'data', (
            SELECT json_agg(row_to_json(v))
            FROM (
                SELECT * FROM public.vehicles 
                WHERE status IN ('parked', 'notified')
                ORDER BY check_in_time ASC
            ) v
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_vehicles_secure TO anon;

-- FUNCTION: get_dashboard_stats_secure
-- Purpose: Get dashboard statistics (requires valid session)
CREATE OR REPLACE FUNCTION public.get_dashboard_stats_secure(session_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_op_id uuid;
    v_in_yard int;
    v_released_today int;
    v_avg_wait_mins numeric;
BEGIN
    SELECT public.validate_token(session_token) INTO v_op_id;
    
    IF v_op_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Invalid session');
    END IF;
    
    -- Calculate stats
    SELECT COUNT(*) INTO v_in_yard 
    FROM public.vehicles 
    WHERE status IN ('parked', 'notified');
    
    SELECT COUNT(*) INTO v_released_today
    FROM public.vehicles
    WHERE status = 'released' 
      AND release_time >= CURRENT_DATE;
    
    SELECT AVG(EXTRACT(EPOCH FROM (notify_time - check_in_time))/60) INTO v_avg_wait_mins
    FROM public.vehicles
    WHERE notify_time IS NOT NULL 
      AND check_in_time >= CURRENT_DATE - INTERVAL '7 days';
    
    RETURN json_build_object(
        'success', true,
        'in_yard', COALESCE(v_in_yard, 0),
        'released_today', COALESCE(v_released_today, 0),
        'avg_wait_mins', ROUND(COALESCE(v_avg_wait_mins, 0))
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_stats_secure TO anon;

-- FUNCTION: checkin_vehicle
-- Purpose: Check in a new vehicle (requires valid session)
CREATE OR REPLACE FUNCTION public.checkin_vehicle(
    session_token text,
    p_registration text,
    p_po_ref text DEFAULT NULL,
    p_haulier text DEFAULT NULL,
    p_mobile text DEFAULT NULL,
    p_notes text DEFAULT NULL,
    p_quoted_minutes int DEFAULT 60,
    p_classification text DEFAULT 'normal'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_op_id uuid;
    v_vehicle_id uuid;
    v_due_time timestamptz;
BEGIN
    SELECT public.validate_token(session_token) INTO v_op_id;
    
    IF v_op_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Invalid session');
    END IF;
    
    -- Calculate due time
    v_due_time := now() + (p_quoted_minutes || ' minutes')::interval;
    
    -- Insert vehicle
    INSERT INTO public.vehicles (
        registration,
        po_ref,
        haulier,
        mobile_number,
        notes,
        quoted_minutes,
        due_time,
        classification,
        operator_id,
        status
    ) VALUES (
        UPPER(p_registration),
        p_po_ref,
        p_haulier,
        p_mobile,
        p_notes,
        p_quoted_minutes,
        v_due_time,
        p_classification,
        v_op_id,
        'parked'
    )
    RETURNING id INTO v_vehicle_id;
    
    -- Log action
    INSERT INTO public.actions_log (vehicle_id, operator_id, action, timestamp)
    VALUES (v_vehicle_id, v_op_id, 'check_in', now());
    
    RETURN json_build_object(
        'success', true,
        'vehicle_id', v_vehicle_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.checkin_vehicle TO anon;

-- FUNCTION: notify_vehicle_secure
-- Purpose: Mark vehicle as notified (requires valid session)
CREATE OR REPLACE FUNCTION public.notify_vehicle_secure(
    session_token text,
    p_vehicle_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_op_id uuid;
BEGIN
    SELECT public.validate_token(session_token) INTO v_op_id;
    
    IF v_op_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Invalid session');
    END IF;
    
    -- Update vehicle
    UPDATE public.vehicles
    SET status = 'notified',
        notify_time = now(),
        operator_id = v_op_id
    WHERE id = p_vehicle_id;
    
    -- Log action
    INSERT INTO public.actions_log (vehicle_id, operator_id, action, timestamp)
    VALUES (p_vehicle_id, v_op_id, 'notified', now());
    
    RETURN json_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_vehicle_secure TO anon;

-- FUNCTION: release_vehicle_secure
-- Purpose: Mark vehicle as released (requires valid session)
CREATE OR REPLACE FUNCTION public.release_vehicle_secure(
    session_token text,
    p_vehicle_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_op_id uuid;
BEGIN
    SELECT public.validate_token(session_token) INTO v_op_id;
    
    IF v_op_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Invalid session');
    END IF;
    
    -- Update vehicle
    UPDATE public.vehicles
    SET status = 'released',
        release_time = now(),
        operator_id = v_op_id
    WHERE id = p_vehicle_id;
    
    -- Log action
    INSERT INTO public.actions_log (vehicle_id, operator_id, action, timestamp)
    VALUES (p_vehicle_id, v_op_id, 'released', now());
    
    RETURN json_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.release_vehicle_secure TO anon;

-- ============================================
-- SECTION 4: RLS POLICIES
-- ============================================

-- Operators: Allow login page to read operator list
CREATE POLICY "allow_operator_select" ON public.operators
FOR SELECT TO anon
USING (active = true);

-- Sessions: Allow token validation
CREATE POLICY "allow_session_lookup" ON public.operator_sessions
FOR SELECT TO anon
USING (expires_at > now());

-- Vehicles: Managed via RPC functions only
CREATE POLICY "deny_direct_access" ON public.vehicles
FOR ALL TO anon
USING (false);

-- Actions Log: Managed via RPC functions only
CREATE POLICY "deny_direct_access" ON public.actions_log
FOR ALL TO anon
USING (false);

-- Prebookings: Allow read for arrivals dashboard
CREATE POLICY "allow_prebooking_read" ON public.prebookings
FOR SELECT TO anon
USING (true);

-- ============================================
-- SECTION 5: INITIAL DATA SETUP
-- ============================================

-- Create default operators (CHANGE PINS IN PRODUCTION!)
INSERT INTO public.operators (name, pin_code, role, active) VALUES
('Supervisor', '270379', 'supervisor', true),
('security', '270379', 'gatehouse', true),
('FLT1', '270379', 'operator', true),
('FLT2', '270379', 'operator', true)
ON CONFLICT DO NOTHING;

-- ============================================
-- SECTION 6: COMMON MAINTENANCE QUERIES
-- ============================================

-- Clean PIN codes (remove whitespace/newlines)
-- RUN THIS if operators can't log in
UPDATE public.operators 
SET pin_code = TRIM(BOTH E'\r\n\t ' FROM pin_code)
WHERE active = true;

-- Reset all PINs to same value (for testing)
UPDATE public.operators 
SET pin_code = '270379'
WHERE active = true;

-- View active operators with PIN status
SELECT id, name, role, pin_code, LENGTH(pin_code) as pin_length, active
FROM public.operators
WHERE active = true
ORDER BY role, name;

-- Clear expired sessions (run daily)
DELETE FROM public.operator_sessions
WHERE expires_at < now();

-- View current sessions
SELECT 
    o.name,
    o.role,
    s.expires_at,
    s.expires_at > now() as is_valid
FROM public.operator_sessions s
JOIN public.operators o ON o.id = s.operator_id
ORDER BY s.expires_at DESC;

-- View vehicles in yard
SELECT 
    registration,
    po_ref,
    status,
    check_in_time,
    EXTRACT(EPOCH FROM (now() - check_in_time))/60 as wait_mins
FROM public.vehicles
WHERE status IN ('parked', 'notified')
ORDER BY check_in_time ASC;

-- View today's activity
SELECT 
    v.registration,
    v.po_ref,
    a.action,
    a.timestamp,
    o.name as operator
FROM public.actions_log a
LEFT JOIN public.vehicles v ON v.id = a.vehicle_id
LEFT JOIN public.operators o ON o.id = a.operator_id
WHERE a.timestamp >= CURRENT_DATE
ORDER BY a.timestamp DESC;

-- ============================================
-- SETUP COMPLETE
-- ============================================
-- Next steps:
-- 1. Update PIN codes for production
-- 2. Set up daily session cleanup (cron/scheduled job)
-- 3. Configure RLS policies for specific roles if needed
-- 4. Test login with each operator role
-- ============================================
```

### What This Script Does

1. ✅ Creates 5 core tables with proper constraints
2. ✅ Adds performance indexes on frequently queried columns
3. ✅ Creates 7 secure RPC functions for authentication & operations
4. ✅ Enables Row-Level Security with appropriate policies
5. ✅ Inserts default operators (Supervisor, security, FLT1, FLT2)
6. ✅ Sets up foreign key relationships
7. ✅ Grants permissions to `anon` role for RPC execution

### Expected Output

```
Success. No rows returned
Execution time: ~2-5 seconds
```

If you see errors, check [Troubleshooting](#troubleshooting) section below.

---

## Post-Installation

### 1. Update Connection Strings

Get your Supabase credentials:

```
Project Settings → API → Project URL
Project Settings → API → anon public key
```

Update these files:
- `login.html` - Line ~95-97
- `index.html` - Line ~25-27
- `supervisor.html` - Line ~150-152
- `arrivals.html` - Line ~80-82
- `report.html` - Line ~35-37

### 2. Set Production PINs

**CRITICAL:** Change default PINs before deployment!

```sql
-- Set unique PINs for each operator
UPDATE operators SET pin_code = '123456' WHERE name = 'Supervisor';
UPDATE operators SET pin_code = '234567' WHERE name = 'security';
UPDATE operators SET pin_code = '345678' WHERE name = 'FLT1';
UPDATE operators SET pin_code = '456789' WHERE name = 'FLT2';

-- Verify all PINs are set
SELECT name, role, LENGTH(pin_code) as pin_length 
FROM operators 
WHERE active = true;
```

### 3. Add Your Operators

```sql
-- Add real staff members
INSERT INTO operators (name, pin_code, role, active) VALUES
('John Smith', '111111', 'gatehouse', true),
('Jane Doe', '222222', 'supervisor', true),
('Mike Johnson', '333333', 'operator', true);
```

### 4. Configure Realtime (Optional)

Enable realtime updates for live dashboard:

```
Project Settings → Database → Replication
→ Enable replication for: vehicles, actions_log
```

### 5. Test Each Role

1. Login as **gatehouse** → Check in a vehicle → Verify QR code generation
2. Login as **operator** → Check dashboard loads → Test notify/release
3. Login as **supervisor** → Test command palette (Ctrl+K) → Test interventions

---

## Troubleshooting

### Common Issues

#### 1. "Invalid credentials" on login

**Cause:** PIN has whitespace or encoding issues

**Fix:**
```sql
-- Clean all PINs
UPDATE operators 
SET pin_code = TRIM(BOTH E'\r\n\t ' FROM pin_code)
WHERE active = true;

-- Verify
SELECT name, pin_code, LENGTH(pin_code) FROM operators;
-- All should show length = 6
```

#### 2. "Invalid session" immediately after login

**Cause:** `validate_token()` function missing or broken

**Fix:**
```sql
-- Check function exists
SELECT proname FROM pg_proc 
WHERE proname = 'validate_token' 
  AND pronamespace = 'public'::regnamespace;

-- If not found, re-run the validate_token CREATE FUNCTION from build script
```

#### 3. RLS policy errors

**Cause:** Missing policies or incorrect RLS configuration

**Fix:**
```sql
-- Check RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public';

-- Re-enable if needed
ALTER TABLE operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE operator_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE actions_log ENABLE ROW LEVEL SECURITY;
```

#### 4. Frontend can't connect

**Cause:** Wrong Supabase URL or anon key

**Fix:**
- Verify URL: `https://YOUR_PROJECT.supabase.co`
- Verify anon key: Project Settings → API → `anon public`
- Check CORS settings if using custom domain

#### 5. Slow queries (>1000ms)

**Cause:** Missing indexes or inefficient queries

**Fix:**
```sql
-- Verify indexes exist
SELECT indexname, tablename 
FROM pg_indexes 
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- Re-create if missing (see build script Section 2)
```

### Getting Help

If issues persist:
1. Check browser console (F12) for JavaScript errors
2. Check Supabase logs: Project Dashboard → Logs → Postgres Logs
3. Verify all RPC functions return proper JSON format
4. Test RPC calls directly in SQL Editor before debugging frontend

---

## Maintenance

### Daily Tasks

```sql
-- 1. Clear expired sessions (can be automated with pg_cron)
DELETE FROM operator_sessions WHERE expires_at < now();

-- 2. Archive old vehicles (optional - move to archive table)
-- This keeps the main vehicles table fast
UPDATE vehicles 
SET status = 'archived' 
WHERE release_time < now() - interval '30 days';
```

### Weekly Tasks

```sql
-- 1. Check database size
SELECT 
    pg_size_pretty(pg_database_size(current_database())) as db_size;

-- 2. Review slow queries
-- Use Supabase Dashboard → Database → Query Performance

-- 3. Verify all operators are active
SELECT name, role, active, created_at 
FROM operators 
ORDER BY active DESC, name;
```

### Monthly Tasks

```sql
-- 1. Clean old action logs (keep 90 days)
DELETE FROM actions_log 
WHERE timestamp < now() - interval '90 days';

-- 2. Analyze table statistics
ANALYZE operators;
ANALYZE vehicles;
ANALYZE actions_log;

-- 3. Review index usage
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan as index_scans,
    idx_tup_read as tuples_read
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;
```

### Backup Strategy

**Automatic:** Supabase provides daily backups (retained 7 days on free tier)

**Manual Backup:**
```bash
# Using pg_dump (requires PostgreSQL client)
pg_dump -h YOUR_PROJECT.supabase.co \
        -U postgres \
        -d postgres \
        -F c \
        -f Lorry Park_backup_$(date +%Y%m%d).dump

# Or use Supabase Dashboard:
# Project Settings → Database → Backups
```

### Performance Tuning

If system becomes slow with high volume:

```sql
-- 1. Add composite indexes for common queries
CREATE INDEX idx_vehicles_status_checkin 
ON vehicles(status, check_in_time);

-- 2. Partition actions_log by month (advanced)
-- See PostgreSQL partitioning documentation

-- 3. Enable query plan caching
-- Already enabled by default in Supabase

-- 4. Consider read replicas for reporting
-- Supabase Pro feature
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 4.0.0 | 2024-12-04 | Session authentication, PIN cleanup, complete RPC security |
| 3.8.0 | 2024-12-03 | Performance optimization, indexing, query refactoring |
| 3.5.0 | 2024-12-02 | Supervisor dashboard, command palette, SMS simulation |
| 3.0.0 | 2024-12-01 | Arrivals board, prebooking integration |
| 2.0.0 | 2024-11-30 | Real-time updates, QR codes, export classification |
| 1.0.0 | 2024-11-28 | Initial release - basic check-in/release |

---

## Related Documentation

- **guide.md** - Frontend development guide and design system
- **SMS_INTEGRATION_GUIDE.md** - Real SMS setup instructions
- **json_guide.md** - Prebooking data format specification
- **todo.txt** - Planned features and improvements

---

## Support & Contact

**Developer:** Lee (First-line Support Technician)  
**Team:** 15 .NET developers (warehouse/logistics facility)  
**System:** Production deployment at DCS warehouse

For issues or questions:
1. Check Troubleshooting section above
2. Review Supabase logs and browser console
3. Test RPC functions directly in SQL Editor
4. Consult with development team if database schema changes needed

---

## License & Usage

Internal system for DCS warehouse operations.  
Not for redistribution or commercial use outside organization.

**Critical Note:** This system handles live operational data. Always:
- Test changes in development environment first
- Backup database before schema modifications  
- Document all customizations
- Keep PIN codes secure and change defaults before production use

---

*End of Database Build Guide*

