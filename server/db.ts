import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import fs from 'fs';
import path from 'path';

let dbInstance: Database | null = null;
let SQL: SqlJsStatic | null = null;
const DB_FILE_PATH = path.resolve(process.cwd(), 'tickets.sqlite');

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user' | 'guest';
  department: string;
  title?: string;
  avatar?: string;
  created_at: string;
}

export interface Ticket {
  id: string;
  title: string;
  description: string;
  category: 'hardware' | 'network' | 'software' | 'access' | 'security' | 'other';
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  submitter_name: string;
  submitter_email: string;
  department: string;
  device_asset_tag?: string | null;
  assignee_id?: string | null;
  assignee_name?: string | null;
  assignee_avatar?: string | null;
  resolution_notes?: string | null;
  created_at: string;
  updated_at: string;
  resolved_at?: string | null;
  sla_due_at: string;
}

export interface TicketActivity {
  id: string;
  ticket_id: string;
  actor_name: string;
  action_type: 'created' | 'status_changed' | 'priority_changed' | 'reassigned' | 'note_added' | 'resolved' | 'updated';
  old_value?: string | null;
  new_value?: string | null;
  comment?: string | null;
  created_at: string;
}

export const IT_STAFF = [
  {
    id: 'staff-1',
    name: 'Sarah Jenkins',
    role: 'Senior Systems Engineer',
    avatar: '/src/assets/images/avatar_it_sarah_1790510445858.jpg',
    specialty: 'Cloud, Infrastructure & macOS'
  },
  {
    id: 'staff-2',
    name: 'Marcus Chen',
    role: 'Lead Network Engineer',
    avatar: '/src/assets/images/avatar_it_marcus_1790510454846.jpg',
    specialty: 'Routing, VPN & Switches'
  },
  {
    id: 'staff-3',
    name: 'Elena Rostova',
    role: 'Security & Identity Lead',
    avatar: '/src/assets/images/avatar_it_elena_1790510465092.jpg',
    specialty: 'IAM, SSO, Okta & Certificates'
  },
  {
    id: 'staff-4',
    name: 'Alex Rivera',
    role: 'Desktop & Endpoint Specialist',
    avatar: '/src/assets/images/avatar_it_alex_1790510475289.jpg',
    specialty: 'Hardware, Monitors & Peripherals'
  }
];

export async function getDb(): Promise<Database> {
  if (dbInstance) {
    return dbInstance;
  }

  SQL = await initSqlJs();

  if (fs.existsSync(DB_FILE_PATH)) {
    try {
      const fileBuffer = fs.readFileSync(DB_FILE_PATH);
      dbInstance = new SQL.Database(fileBuffer);
    } catch {
      dbInstance = new SQL.Database();
    }
  } else {
    dbInstance = new SQL.Database();
  }

  // Ensure tables exist
  dbInstance.run(`
    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      priority TEXT NOT NULL,
      status TEXT NOT NULL,
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

    CREATE TABLE IF NOT EXISTS ticket_activities (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL,
      actor_name TEXT NOT NULL,
      action_type TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      comment TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      role TEXT NOT NULL,
      department TEXT NOT NULL,
      title TEXT,
      avatar TEXT,
      created_at TEXT NOT NULL
    );
  `);

  // Check if users table is empty, if so, seed users
  const userCountResult = dbInstance.exec('SELECT COUNT(*) as count FROM users');
  const userCount = userCountResult[0]?.values[0]?.[0] as number;
  if (userCount === 0) {
    seedUsers(dbInstance);
  }

  // Check if tickets table is empty, if so, seed
  const countResult = dbInstance.exec('SELECT COUNT(*) as count FROM tickets');
  const count = countResult[0]?.values[0]?.[0] as number;
  if (count === 0) {
    seedDatabase(dbInstance);
  }

  persistDb(dbInstance);
  return dbInstance;
}

export function persistDb(db: Database) {
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_FILE_PATH, buffer);
  } catch (err) {
    console.error('Failed to persist SQLite database to disk:', err);
  }
}

export function queryAll<T>(db: Database, sql: string, params: any[] = []): T[] {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows: T[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as unknown as T);
  }
  stmt.free();
  return rows;
}

export function queryOne<T>(db: Database, sql: string, params: any[] = []): T | null {
  const rows = queryAll<T>(db, sql, params);
  return rows.length > 0 ? rows[0] : null;
}

export function runQuery(db: Database, sql: string, params: any[] = []): void {
  const stmt = db.prepare(sql);
  stmt.run(params);
  stmt.free();
  persistDb(db);
}

function seedDatabase(db: Database) {
  const now = new Date();
  const subHours = (h: number) => new Date(now.getTime() - h * 3600 * 1000).toISOString();
  const addHours = (h: number) => new Date(now.getTime() + h * 3600 * 1000).toISOString();

  const initialTickets: Ticket[] = [
    {
      id: 'TCK-1001',
      title: 'Floor 3 Wi-Fi Gateway intermittent packet drop',
      description: 'Multiple users across the product design team report dropping connection during Zoom calls. Ping test shows 18% packet loss to the main core switch 10.0.4.1.',
      category: 'network',
      priority: 'critical',
      status: 'in_progress',
      submitter_name: 'David Miller',
      submitter_email: 'd.miller@company.internal',
      department: 'Engineering',
      device_asset_tag: 'NET-AP-3F-04',
      assignee_id: 'staff-2',
      assignee_name: 'Marcus Chen',
      assignee_avatar: '/src/assets/images/avatar_it_marcus_1790510454846.jpg',
      resolution_notes: 'Traced to faulty SFP+ transceiver on Access Point 3-North. Replacement module ordered from inventory; temporarily rerouted traffic to backup AP.',
      created_at: subHours(4),
      updated_at: subHours(1),
      resolved_at: null,
      sla_due_at: addHours(1)
    },
    {
      id: 'TCK-1002',
      title: 'PostgreSQL read replica synchronization delay',
      description: 'Staging analytics pipeline reporting 45-minute lag on replica-02. Queries against customer transaction history are timing out with SSL connection reset.',
      category: 'software',
      priority: 'high',
      status: 'open',
      submitter_name: 'Sophia Patel',
      submitter_email: 's.patel@company.internal',
      department: 'Data & Analytics',
      device_asset_tag: 'SRV-DB-STG-02',
      assignee_id: 'staff-1',
      assignee_name: 'Sarah Jenkins',
      assignee_avatar: '/src/assets/images/avatar_it_sarah_1790510445858.jpg',
      resolution_notes: null,
      created_at: subHours(6),
      updated_at: subHours(6),
      resolved_at: null,
      sla_due_at: addHours(6)
    },
    {
      id: 'TCK-1003',
      title: 'Dual 4K USB-C Dell Thunderbolt Dock display flicker',
      description: 'External monitor 2 blacks out every 3-5 minutes when running GPU-intensive Figma rendering. Laptop is MacBook Pro M3 Max. DisplayPort cable replaced without success.',
      category: 'hardware',
      priority: 'medium',
      status: 'in_progress',
      submitter_name: 'Rachel Kim',
      submitter_email: 'r.kim@company.internal',
      department: 'Design',
      device_asset_tag: 'MBP-2024-DSN-14',
      assignee_id: 'staff-4',
      assignee_name: 'Alex Rivera',
      assignee_avatar: '/src/assets/images/avatar_it_alex_1790510475289.jpg',
      resolution_notes: 'Dock firmware update package 1.28 applied. Monitoring video signal stability over the next 24 hours.',
      created_at: subHours(18),
      updated_at: subHours(3),
      resolved_at: null,
      sla_due_at: addHours(6)
    },
    {
      id: 'TCK-1004',
      title: 'SSO Okta access token expired on GitHub Enterprise',
      description: 'Receiving SAML authentication loop when pushing commits to git.company.internal. Other Okta apps like Slack and Jira work normally.',
      category: 'access',
      priority: 'high',
      status: 'resolved',
      submitter_name: 'Liam Vance',
      submitter_email: 'l.vance@company.internal',
      department: 'Engineering',
      device_asset_tag: 'LINUX-WS-09',
      assignee_id: 'staff-3',
      assignee_name: 'Elena Rostova',
      assignee_avatar: '/src/assets/images/avatar_it_elena_1790510465092.jpg',
      resolution_notes: 'Regenerated SCIM identity provisioning mapping in Okta admin console and cleared cached OAuth session token. User verified push access restored.',
      created_at: subHours(28),
      updated_at: subHours(12),
      resolved_at: subHours(12),
      sla_due_at: subHours(16)
    },
    {
      id: 'TCK-1005',
      title: 'Finance department network printer paper feed sensor error',
      description: 'HP LaserJet Enterprise 700 shows "Clear Paper Jam in Tray 2" although tray is completely clean and freshly stocked with 80gsm paper.',
      category: 'hardware',
      priority: 'low',
      status: 'open',
      submitter_name: 'Barbara Hayes',
      submitter_email: 'b.hayes@company.internal',
      department: 'Finance',
      device_asset_tag: 'PRN-FIN-4F-01',
      assignee_id: null,
      assignee_name: null,
      assignee_avatar: null,
      resolution_notes: null,
      created_at: subHours(2),
      updated_at: subHours(2),
      resolved_at: null,
      sla_due_at: addHours(46)
    },
    {
      id: 'TCK-1006',
      title: 'Suspicious phishing email reporting credential harvest link',
      description: 'Multiple employees in Sales received an email purporting to be "HR Benefits Update" pointing to a lookalike external domain (hr-benefits-portal-login.net).',
      category: 'security',
      priority: 'critical',
      status: 'resolved',
      submitter_name: 'Carlos Mendez',
      submitter_email: 'c.mendez@company.internal',
      department: 'Sales',
      device_asset_tag: null,
      assignee_id: 'staff-3',
      assignee_name: 'Elena Rostova',
      assignee_avatar: '/src/assets/images/avatar_it_elena_1790510465092.jpg',
      resolution_notes: 'Blacklisted sender domain in Google Workspace mail gateway, revoked 2 clicked sessions via Okta admin log, and ran endpoint malware sweep. All clear.',
      created_at: subHours(40),
      updated_at: subHours(22),
      resolved_at: subHours(22),
      sla_due_at: subHours(36)
    },
    {
      id: 'TCK-1007',
      title: 'Docker Desktop WSL2 engine memory exhaustion on Windows 11',
      description: 'Vmmem process consuming 28GB of 32GB RAM causing system freeze during local microservices stack startup.',
      category: 'software',
      priority: 'medium',
      status: 'closed',
      submitter_name: 'Anika Sharma',
      submitter_email: 'a.sharma@company.internal',
      department: 'Engineering',
      device_asset_tag: 'DELL-XPS-DEV-03',
      assignee_id: 'staff-1',
      assignee_name: 'Sarah Jenkins',
      assignee_avatar: '/src/assets/images/avatar_it_sarah_1790510445858.jpg',
      resolution_notes: 'Created custom .wslconfig setting memory cap to 14GB and enabled swap file. Performance stabilized.',
      created_at: subHours(72),
      updated_at: subHours(48),
      resolved_at: subHours(48),
      sla_due_at: subHours(48)
    }
  ];

  for (const t of initialTickets) {
    db.run(
      `INSERT INTO tickets (id, title, description, category, priority, status, submitter_name, submitter_email, department, device_asset_tag, assignee_id, assignee_name, assignee_avatar, resolution_notes, created_at, updated_at, resolved_at, sla_due_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        t.id,
        t.title,
        t.description,
        t.category,
        t.priority,
        t.status,
        t.submitter_name,
        t.submitter_email,
        t.department,
        t.device_asset_tag || null,
        t.assignee_id || null,
        t.assignee_name || null,
        t.assignee_avatar || null,
        t.resolution_notes || null,
        t.created_at,
        t.updated_at,
        t.resolved_at || null,
        t.sla_due_at
      ]
    );

    // Initial creation activity
    db.run(
      `INSERT INTO ticket_activities (id, ticket_id, actor_name, action_type, old_value, new_value, comment, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `ACT-${Math.random().toString(36).substring(2, 9)}`,
        t.id,
        t.submitter_name,
        'created',
        null,
        'open',
        'Ticket submitted through the internal IT Portal.',
        t.created_at
      ]
    );

    if (t.assignee_name) {
      db.run(
        `INSERT INTO ticket_activities (id, ticket_id, actor_name, action_type, old_value, new_value, comment, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          `ACT-${Math.random().toString(36).substring(2, 9)}`,
          t.id,
          'IT Dispatch',
          'reassigned',
          'Unassigned',
          t.assignee_name,
          `Assigned to ${t.assignee_name}`,
          t.updated_at
        ]
      );
    }

    if (t.resolution_notes) {
      db.run(
        `INSERT INTO ticket_activities (id, ticket_id, actor_name, action_type, old_value, new_value, comment, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          `ACT-${Math.random().toString(36).substring(2, 9)}`,
          t.id,
          t.assignee_name || 'Support Staff',
          t.status === 'resolved' ? 'resolved' : 'note_added',
          null,
          null,
          t.resolution_notes,
          t.updated_at
        ]
      );
    }
  }
}

export function seedUsers(db: Database) {
  const nowIso = new Date().toISOString();
  const defaultUsers: User[] = [
    {
      id: 'usr-admin-1',
      name: 'Sarah Jenkins',
      email: 'sarah.jenkins@company.internal',
      role: 'admin',
      department: 'IT & Infrastructure',
      title: 'Senior Systems Engineer',
      avatar: '/src/assets/images/avatar_it_sarah_1790510445858.jpg',
      created_at: nowIso
    },
    {
      id: 'usr-admin-2',
      name: 'Marcus Chen',
      email: 'marcus.chen@company.internal',
      role: 'admin',
      department: 'IT Network Ops',
      title: 'Lead Network Engineer',
      avatar: '/src/assets/images/avatar_it_marcus_1790510454846.jpg',
      created_at: nowIso
    },
    {
      id: 'usr-admin-3',
      name: 'Elena Rostova',
      email: 'elena.rostova@company.internal',
      role: 'admin',
      department: 'Information Security',
      title: 'Security & Identity Lead',
      avatar: '/src/assets/images/avatar_it_elena_1790510465092.jpg',
      created_at: nowIso
    },
    {
      id: 'usr-admin-4',
      name: 'Alex Rivera',
      email: 'alex.rivera@company.internal',
      role: 'admin',
      department: 'IT Service Desk',
      title: 'Endpoint Specialist',
      avatar: '/src/assets/images/avatar_it_alex_1790510475289.jpg',
      created_at: nowIso
    },
    {
      id: 'usr-emp-1',
      name: 'David Miller',
      email: 'd.miller@company.internal',
      role: 'user',
      department: 'Engineering',
      title: 'Staff Software Engineer',
      avatar: '',
      created_at: nowIso
    },
    {
      id: 'usr-emp-2',
      name: 'Sophia Patel',
      email: 's.patel@company.internal',
      role: 'user',
      department: 'Data & Analytics',
      title: 'Senior Data Scientist',
      avatar: '',
      created_at: nowIso
    },
    {
      id: 'usr-emp-3',
      name: 'Rachel Kim',
      email: 'r.kim@company.internal',
      role: 'user',
      department: 'Design',
      title: 'Principal Product Designer',
      avatar: '',
      created_at: nowIso
    },
    {
      id: 'usr-emp-4',
      name: 'Carlos Mendez',
      email: 'c.mendez@company.internal',
      role: 'user',
      department: 'Sales',
      title: 'Enterprise Account Executive',
      avatar: '',
      created_at: nowIso
    },
    {
      id: 'usr-guest-1',
      name: 'Guest User',
      email: 'guest@visitor.internal',
      role: 'guest',
      department: 'External / Contractor',
      title: 'Guest Requester',
      avatar: '',
      created_at: nowIso
    }
  ];

  for (const u of defaultUsers) {
    db.run(
      `INSERT OR IGNORE INTO users (id, name, email, role, department, title, avatar, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [u.id, u.name, u.email, u.role, u.department, u.title || null, u.avatar || null, u.created_at]
    );
  }
}
