-- =====================================================================
-- IT Support Ticket Management System - Relational SQL Database Schema
-- Database: SQLite / PostgreSQL / MySQL Compatible Standard SQL
-- =====================================================================

-- 1. USERS TABLE (Multi-Role Authentication: Admin, Employee/User, Guest)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'user', 'guest')),
  department TEXT NOT NULL,
  title TEXT,
  avatar TEXT,
  created_at TEXT NOT NULL
);

-- 2. TICKETS TABLE (Standardized Issue Reporting & Resolution Tracking)
CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('hardware', 'network', 'software', 'access', 'security', 'other')),
  priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  submitter_name TEXT NOT NULL,
  submitter_email TEXT NOT NULL,
  department TEXT NOT NULL,
  device_asset_tag TEXT,
  assignee_id TEXT,
  assignee_name TEXT,
  assignee_avatar TEXT,
  resolution_notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT,
  sla_due_at TEXT NOT NULL
);

-- 3. TICKET ACTIVITIES AUDIT LOG TABLE (Chronological Action History)
CREATE TABLE IF NOT EXISTS ticket_activities (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('created', 'status_changed', 'priority_changed', 'reassigned', 'note_added', 'resolved', 'updated')),
  old_value TEXT,
  new_value TEXT,
  comment TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
);

-- =====================================================================
-- SEED DATA: USERS (Admin, Company Employees, and Guest)
-- =====================================================================

-- Admins
INSERT OR IGNORE INTO users (id, name, email, role, department, title, avatar, created_at)
VALUES 
  ('usr-admin-1', 'Sarah Jenkins', 'sarah.jenkins@company.internal', 'admin', 'IT & Infrastructure', 'Senior Systems Engineer', '/src/assets/images/avatar_it_sarah_1790510445858.jpg', datetime('now')),
  ('usr-admin-2', 'Marcus Chen', 'marcus.chen@company.internal', 'admin', 'IT Network Ops', 'Lead Network Engineer', '/src/assets/images/avatar_it_marcus_1790510454846.jpg', datetime('now')),
  ('usr-admin-3', 'Elena Rostova', 'elena.rostova@company.internal', 'admin', 'Information Security', 'Security & Identity Lead', '/src/assets/images/avatar_it_elena_1790510465092.jpg', datetime('now')),
  ('usr-admin-4', 'Alex Rivera', 'alex.rivera@company.internal', 'admin', 'IT Service Desk', 'Endpoint Specialist', '/src/assets/images/avatar_it_alex_1790510475289.jpg', datetime('now'));

-- Company Employees (Users)
INSERT OR IGNORE INTO users (id, name, email, role, department, title, avatar, created_at)
VALUES 
  ('usr-emp-1', 'David Miller', 'd.miller@company.internal', 'user', 'Engineering', 'Staff Software Engineer', NULL, datetime('now')),
  ('usr-emp-2', 'Sophia Patel', 's.patel@company.internal', 'user', 'Data & Analytics', 'Senior Data Scientist', NULL, datetime('now')),
  ('usr-emp-3', 'Rachel Kim', 'r.kim@company.internal', 'user', 'Design', 'Principal Product Designer', NULL, datetime('now')),
  ('usr-emp-4', 'Carlos Mendez', 'c.mendez@company.internal', 'user', 'Sales', 'Enterprise Account Executive', NULL, datetime('now'));

-- Guest User
INSERT OR IGNORE INTO users (id, name, email, role, department, title, avatar, created_at)
VALUES 
  ('usr-guest-1', 'Guest User', 'guest@visitor.internal', 'guest', 'External / Contractor', 'Visitor / Contractor', NULL, datetime('now'));

-- =====================================================================
-- SEED DATA: TICKETS
-- =====================================================================

INSERT OR IGNORE INTO tickets (id, title, description, category, priority, status, submitter_name, submitter_email, department, device_asset_tag, assignee_id, assignee_name, assignee_avatar, resolution_notes, created_at, updated_at, resolved_at, sla_due_at)
VALUES
  ('TCK-1001', 'Floor 3 Wi-Fi Gateway intermittent packet drop', 'Multiple users across the product design team report dropping connection during Zoom calls. Ping test shows 18% packet loss to core switch 10.0.4.1.', 'network', 'critical', 'in_progress', 'David Miller', 'd.miller@company.internal', 'Engineering', 'NET-AP-3F-04', 'staff-2', 'Marcus Chen', '/src/assets/images/avatar_it_marcus_1790510454846.jpg', 'Traced to faulty SFP+ transceiver on Access Point 3-North. Replacement module ordered.', datetime('now', '-4 hours'), datetime('now', '-1 hour'), NULL, datetime('now', '+1 hour')),
  ('TCK-1002', 'PostgreSQL read replica synchronization delay', 'Staging analytics pipeline reporting 45-minute lag on replica-02. Queries timing out with SSL connection reset.', 'software', 'high', 'open', 'Sophia Patel', 's.patel@company.internal', 'Data & Analytics', 'SRV-DB-STG-02', 'staff-1', 'Sarah Jenkins', '/src/assets/images/avatar_it_sarah_1790510445858.jpg', NULL, datetime('now', '-6 hours'), datetime('now', '-6 hours'), NULL, datetime('now', '+6 hours')),
  ('TCK-1003', 'Dual 4K USB-C Dell Thunderbolt Dock display flicker', 'External monitor 2 blacks out every 3-5 minutes when running GPU-intensive rendering.', 'hardware', 'medium', 'in_progress', 'Rachel Kim', 'r.kim@company.internal', 'Design', 'MBP-2024-DSN-14', 'staff-4', 'Alex Rivera', '/src/assets/images/avatar_it_alex_1790510475289.jpg', 'Dock firmware update package 1.28 applied. Monitoring signal stability.', datetime('now', '-18 hours'), datetime('now', '-3 hours'), NULL, datetime('now', '+6 hours')),
  ('TCK-1004', 'SSO Okta access token expired on GitHub Enterprise', 'Receiving SAML authentication loop when pushing commits to git.company.internal.', 'access', 'high', 'resolved', 'Liam Vance', 'l.vance@company.internal', 'Engineering', 'LINUX-WS-09', 'staff-3', 'Elena Rostova', '/src/assets/images/avatar_it_elena_1790510465092.jpg', 'Regenerated SCIM identity provisioning mapping in Okta. Restored push access.', datetime('now', '-28 hours'), datetime('now', '-12 hours'), datetime('now', '-12 hours'), datetime('now', '-16 hours')),
  ('TCK-1005', 'Finance department network printer paper feed sensor error', 'HP LaserJet Enterprise 700 shows "Clear Paper Jam in Tray 2" although tray is clean.', 'hardware', 'low', 'open', 'Barbara Hayes', 'b.hayes@company.internal', 'Finance', 'PRN-FIN-4F-01', NULL, NULL, NULL, NULL, datetime('now', '-2 hours'), datetime('now', '-2 hours'), NULL, datetime('now', '+46 hours'));

-- =====================================================================
-- COMMON SQL OPERATIONS (CRUD)
-- =====================================================================

-- 1. SELECT all active tickets ordered by SLA deadline:
-- SELECT * FROM tickets WHERE status IN ('open', 'in_progress') ORDER BY sla_due_at ASC;

-- 2. SELECT tickets submitted by a specific company employee:
-- SELECT * FROM tickets WHERE submitter_email = 'd.miller@company.internal';

-- 3. UPDATE ticket status to resolved with resolution note:
-- UPDATE tickets SET status = 'resolved', resolution_notes = 'Issue addressed.', resolved_at = datetime('now'), updated_at = datetime('now') WHERE id = 'TCK-1001';

-- 4. INSERT a new support ticket:
-- INSERT INTO tickets (id, title, description, category, priority, status, submitter_name, submitter_email, department, created_at, updated_at, sla_due_at)
-- VALUES ('TCK-1006', 'VPN Connection Timeout', 'Cannot connect to eu-west VPN gateway', 'network', 'high', 'open', 'John Doe', 'john@company.internal', 'Engineering', datetime('now'), datetime('now'), datetime('now', '+12 hours'));

-- 5. DELETE a ticket:
-- DELETE FROM tickets WHERE id = 'TCK-1006';
