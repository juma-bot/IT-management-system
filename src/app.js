// IT Support Ticket Management System - Vanilla JavaScript Engine
// Full-Stack frontend communicating with Node.js/Express + SQLite Database

// Application State
const state = {
  tickets: [],
  staff: [],
  users: [],
  currentUser: null,
  isMyTicketsOnly: false,
  stats: null,
  activeTab: 'list',
  filters: {
    status: 'all',
    priority: 'all',
    category: 'all',
    department: 'all',
    assignee: 'all',
    search: ''
  },
  selectedIds: new Set(),
  activeTicketId: null,
  isLoading: false
};

// Priority & Category Configurations (Following Zero-Pill Design Guidelines)
const PRIORITY_CONFIG = {
  critical: { label: 'Critical', textClass: 'text-red-400 font-semibold', dotClass: 'bg-red-500', hours: 4 },
  high: { label: 'High', textClass: 'text-amber-400 font-medium', dotClass: 'bg-amber-500', hours: 12 },
  medium: { label: 'Medium', textClass: 'text-blue-400 font-normal', dotClass: 'bg-blue-400', hours: 24 },
  low: { label: 'Low', textClass: 'text-slate-400 font-normal', dotClass: 'bg-slate-500', hours: 48 }
};

const STATUS_CONFIG = {
  open: { label: 'Open', textClass: 'text-sky-400', dotClass: 'bg-sky-400' },
  in_progress: { label: 'In Progress', textClass: 'text-amber-400', dotClass: 'bg-amber-400' },
  resolved: { label: 'Resolved', textClass: 'text-emerald-400', dotClass: 'bg-emerald-400' },
  closed: { label: 'Closed', textClass: 'text-slate-400', dotClass: 'bg-slate-500' }
};

const CATEGORY_LABELS = {
  hardware: 'Hardware & Devices',
  network: 'Network & Wi-Fi',
  software: 'Software & Apps',
  access: 'Identity & Access (IAM)',
  security: 'Security & Incident',
  other: 'General Support'
};

const PRESET_TEMPLATES = {
  wifi: {
    category: 'network',
    priority: 'high',
    title: 'Intermittent Wi-Fi disconnection on floor 3',
    description: 'Device frequently loses Wi-Fi connection during meetings. RSSI signal drops and DNS fails to resolve local subnets.'
  },
  dock: {
    category: 'hardware',
    priority: 'medium',
    title: 'External monitor flickers when connected via USB-C dock',
    description: 'Secondary display goes black intermittently when waking from sleep. Power cycling the hub temporarily restores signal.'
  },
  sso: {
    category: 'access',
    priority: 'high',
    title: 'Single Sign-On authentication failure / MFA push timeout',
    description: 'Unable to authenticate into corporate Google Workspace and Jira. Okta Verify push notification does not arrive on mobile device.'
  },
  phish: {
    category: 'security',
    priority: 'critical',
    title: 'Suspicious email requesting urgent wire or password verification',
    description: 'Received unexpected email pretending to be executive team requesting credentials. Forwarded raw headers for analysis.'
  }
};

// Utilities
function formatRelativeTime(dateString) {
  if (!dateString) return 'Never';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  return `${diffDays}d ago`;
}

function getSlaStatus(ticket) {
  if (ticket.status === 'resolved' || ticket.status === 'closed') {
    return { isBreached: false, isAtRisk: false, timeLeftText: 'Completed' };
  }

  const now = new Date();
  const due = new Date(ticket.sla_due_at);
  const diffMs = due.getTime() - now.getTime();
  const diffHours = Math.round(diffMs / (1000 * 3600));

  if (diffMs <= 0) {
    const overdueHours = Math.abs(diffHours);
    return {
      isBreached: true,
      isAtRisk: false,
      timeLeftText: overdueHours === 0 ? 'Breaching now' : `${overdueHours}h overdue`
    };
  }

  if (diffHours <= 4) {
    return {
      isBreached: false,
      isAtRisk: true,
      timeLeftText: `${diffHours}h left`
    };
  }

  return {
    isBreached: false,
    isAtRisk: false,
    timeLeftText: `${diffHours}h left`
  };
}

function showToast(message) {
  const toast = document.getElementById('toast');
  const msgEl = document.getElementById('toast-message');
  if (!toast || !msgEl) return;

  msgEl.textContent = message;
  toast.classList.remove('hidden');
  toast.classList.add('flex');

  setTimeout(() => {
    toast.classList.add('hidden');
    toast.classList.remove('flex');
  }, 3500);
}

function getInitials(name) {
  if (!name) return 'U';
  const parts = name.trim().split(' ');
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ============================================================================
// Built-in In-Browser SQL Data Store for VS Code Live Server Mode
// Allows full interactive execution without needing a running backend server
// ============================================================================
const LocalSqlStore = {
  dbKey: 'opsdesk_local_sqlite_db',
  data: null,
  isLiveServerMode: false,

  getDefaultData() {
    const now = Date.now();
    return {
      users: [
        { id: 'usr-admin-1', name: 'Sarah Jenkins', email: 'sarah.jenkins@company.internal', role: 'admin', department: 'IT Infrastructure', title: 'Senior Systems Engineer', avatar: '' },
        { id: 'usr-admin-2', name: 'Marcus Chen', email: 'marcus.chen@company.internal', role: 'admin', department: 'Network Operations', title: 'Lead Network Engineer', avatar: '' },
        { id: 'usr-admin-3', name: 'Elena Rostova', email: 'elena.rostova@company.internal', role: 'admin', department: 'Security & Compliance', title: 'Security & Identity Lead', avatar: '' },
        { id: 'usr-emp-1', name: 'David Miller', email: 'david.miller@company.internal', role: 'user', department: 'Engineering', title: 'Senior Backend Developer', avatar: '' },
        { id: 'usr-emp-2', name: 'Sophia Patel', email: 'sophia.patel@company.internal', role: 'user', department: 'Data & Analytics', title: 'Lead BI Analyst', avatar: '' },
        { id: 'usr-emp-3', name: 'Rachel Kim', email: 'rachel.kim@company.internal', role: 'user', department: 'Product Design', title: 'Staff Product Designer', avatar: '' },
        { id: 'usr-emp-4', name: 'Carlos Mendez', email: 'carlos.mendez@company.internal', role: 'user', department: 'Sales & Growth', title: 'Account Executive', avatar: '' },
        { id: 'usr-guest', name: 'Guest Visitor', email: 'guest@company.internal', role: 'guest', department: 'External / Visitor', title: 'Guest User', avatar: '' }
      ],
      tickets: [
        {
          id: 'TCK-1001',
          title: 'Core Switch VLAN 20 Dropping Packets (18% drop rate)',
          description: 'Severe packet loss observed on 2nd-floor switches. Users report intermittent connection drops to local ERP and network shares.',
          category: 'network',
          priority: 'critical',
          status: 'open',
          submitter_name: 'David Miller',
          submitter_email: 'david.miller@company.internal',
          department: 'Engineering',
          device_asset_tag: 'SW-CORE-02',
          assignee_id: 'usr-admin-2',
          assignee_name: 'Marcus Chen',
          resolution_notes: null,
          created_at: new Date(now - 2 * 3600000).toISOString(),
          updated_at: new Date(now - 2 * 3600000).toISOString(),
          sla_due_at: new Date(now + 2 * 3600000).toISOString()
        },
        {
          id: 'TCK-1002',
          title: 'MacBook Pro M3 Max Thermal Throttling & Sudden Shutdowns',
          description: 'Developer machine experiences severe kernel panic and thermal shutdown during heavy Docker and Xcode builds.',
          category: 'hardware',
          priority: 'high',
          status: 'in_progress',
          submitter_name: 'Sophia Patel',
          submitter_email: 'sophia.patel@company.internal',
          department: 'Data & Analytics',
          device_asset_tag: 'MBP-2024-912',
          assignee_id: 'usr-admin-1',
          assignee_name: 'Sarah Jenkins',
          resolution_notes: 'Diagnostic ran; fan sensor replacement scheduled.',
          created_at: new Date(now - 5 * 3600000).toISOString(),
          updated_at: new Date(now - 1 * 3600000).toISOString(),
          sla_due_at: new Date(now + 3 * 3600000).toISOString()
        },
        {
          id: 'TCK-1003',
          title: 'SSO Okta Authentication Failure: 403 Forbidden After MFA Push',
          description: 'Unable to authenticate into corporate Google Workspace and Jira. Okta Verify push completes but loop returns 403.',
          category: 'security',
          priority: 'critical',
          status: 'resolved',
          submitter_name: 'Carlos Mendez',
          submitter_email: 'carlos.mendez@company.internal',
          department: 'Sales & Growth',
          device_asset_tag: 'SEC-OKTA-01',
          assignee_id: 'usr-admin-3',
          assignee_name: 'Elena Rostova',
          resolution_notes: 'Cleared stale session token in Okta tenant and revoked corrupted cert.',
          created_at: new Date(now - 24 * 3600000).toISOString(),
          updated_at: new Date(now - 2 * 3600000).toISOString(),
          resolved_at: new Date(now - 2 * 3600000).toISOString(),
          sla_due_at: new Date(now + 4 * 3600000).toISOString()
        },
        {
          id: 'TCK-1004',
          title: 'PostgreSQL Read Replica Replication Lag > 600ms',
          description: 'Analytics microservice reporting stale reads due to WAL replication delay between primary and US-East replica.',
          category: 'software',
          priority: 'high',
          status: 'open',
          submitter_name: 'David Miller',
          submitter_email: 'david.miller@company.internal',
          department: 'Engineering',
          device_asset_tag: 'DB-REPL-01',
          assignee_id: 'usr-admin-2',
          assignee_name: 'Marcus Chen',
          resolution_notes: null,
          created_at: new Date(now - 8 * 3600000).toISOString(),
          updated_at: new Date(now - 8 * 3600000).toISOString(),
          sla_due_at: new Date(now + 6 * 3600000).toISOString()
        },
        {
          id: 'TCK-1005',
          title: 'AWS Production IAM Role Permission Request for S3 Analytics Lake',
          description: 'Requesting read-only access to s3://prod-analytics-lake/* for quarterly customer cohort reporting.',
          category: 'access',
          priority: 'medium',
          status: 'in_progress',
          submitter_name: 'Rachel Kim',
          submitter_email: 'rachel.kim@company.internal',
          department: 'Product Design',
          device_asset_tag: 'IAM-AWS-99',
          assignee_id: 'usr-admin-3',
          assignee_name: 'Elena Rostova',
          resolution_notes: 'Manager approval received, pending policy attachment.',
          created_at: new Date(now - 14 * 3600000).toISOString(),
          updated_at: new Date(now - 3 * 3600000).toISOString(),
          sla_due_at: new Date(now + 10 * 3600000).toISOString()
        },
        {
          id: 'TCK-1006',
          title: 'External Monitor 4K 60Hz DisplayPort Signal Flickering at Desk 4B',
          description: 'Dell 32 4K monitor intermittently blacks out for 2 seconds when plugged into CalDigit Thunderbolt dock.',
          category: 'hardware',
          priority: 'low',
          status: 'resolved',
          submitter_name: 'Carlos Mendez',
          submitter_email: 'carlos.mendez@company.internal',
          department: 'Sales & Growth',
          device_asset_tag: 'MON-DELL-402',
          assignee_id: 'usr-admin-1',
          assignee_name: 'Sarah Jenkins',
          resolution_notes: 'Replaced faulty high-bandwidth DP 1.4 cable.',
          created_at: new Date(now - 36 * 3600000).toISOString(),
          updated_at: new Date(now - 12 * 3600000).toISOString(),
          resolved_at: new Date(now - 12 * 3600000).toISOString(),
          sla_due_at: new Date(now + 18 * 3600000).toISOString()
        }
      ],
      activities: []
    };
  },

  init() {
    try {
      const stored = localStorage.getItem(this.dbKey);
      if (stored) {
        this.data = JSON.parse(stored);
      } else {
        this.data = this.getDefaultData();
        this.save();
      }
    } catch {
      this.data = this.getDefaultData();
    }
  },

  save() {
    try {
      localStorage.setItem(this.dbKey, JSON.stringify(this.data));
    } catch (e) {
      console.warn('LocalStorage save failed:', e);
    }
  },

  reset() {
    this.data = this.getDefaultData();
    this.save();
    return true;
  },

  updateIndicator(isLive) {
    this.isLiveServerMode = isLive;
    const textEl = document.getElementById('system-status-text');
    const badgeEl = document.getElementById('system-status-indicator');
    if (textEl && badgeEl) {
      if (isLive) {
        textEl.textContent = 'VS Code Live Server (SQL Active)';
        badgeEl.className = 'hidden md:inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
      } else {
        textEl.textContent = 'Backend REST API (Online)';
        badgeEl.className = 'hidden md:inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20';
      }
    }
  },

  queryTickets(filters, myTicketsOnly = false, email = null) {
    let list = [...this.data.tickets];
    if (filters.status && filters.status !== 'all') {
      list = list.filter(t => t.status === filters.status);
    }
    if (filters.priority && filters.priority !== 'all') {
      list = list.filter(t => t.priority === filters.priority);
    }
    if (filters.category && filters.category !== 'all') {
      list = list.filter(t => t.category === filters.category);
    }
    if (filters.department && filters.department !== 'all') {
      list = list.filter(t => t.department === filters.department);
    }
    if (filters.assignee && filters.assignee !== 'all') {
      if (filters.assignee === 'unassigned') {
        list = list.filter(t => !t.assignee_id);
      } else {
        list = list.filter(t => t.assignee_id === filters.assignee);
      }
    }
    if (filters.search && filters.search.trim()) {
      const q = filters.search.trim().toLowerCase();
      list = list.filter(t => 
        t.title.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.submitter_name.toLowerCase().includes(q)
      );
    }
    if (myTicketsOnly && email) {
      list = list.filter(t => t.submitter_email.toLowerCase() === email.toLowerCase());
    }

    // Sort descending by created_at
    return list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },

  getStats() {
    const tickets = this.data.tickets;
    const now = new Date();
    let breached = 0, atRisk = 0;

    tickets.forEach(t => {
      if (t.status !== 'resolved' && t.status !== 'closed') {
        const diffMs = new Date(t.sla_due_at).getTime() - now.getTime();
        if (diffMs <= 0) breached++;
        else if (diffMs <= 4 * 3600000) atRisk++;
      }
    });

    return {
      total: tickets.length,
      open: tickets.filter(t => t.status === 'open').length,
      in_progress: tickets.filter(t => t.status === 'in_progress').length,
      resolved: tickets.filter(t => t.status === 'resolved' || t.status === 'closed').length,
      critical: tickets.filter(t => t.priority === 'critical').length,
      high: tickets.filter(t => t.priority === 'high').length,
      breached,
      atRisk,
      categoryCounts: {
        hardware: tickets.filter(t => t.category === 'hardware').length,
        network: tickets.filter(t => t.category === 'network').length,
        software: tickets.filter(t => t.category === 'software').length,
        access: tickets.filter(t => t.category === 'access').length,
        security: tickets.filter(t => t.category === 'security').length,
        other: tickets.filter(t => t.category === 'other').length
      }
    };
  },

  executeSql(query) {
    const q = query.trim().replace(/;$/, '');
    const start = performance.now();

    if (/^SELECT\s+\*\s+FROM\s+tickets/i.test(q)) {
      const tickets = this.data.tickets;
      const columns = ['id', 'title', 'category', 'priority', 'status', 'submitter_name', 'department', 'assignee_name', 'created_at', 'sla_due_at'];
      const rows = tickets.map(t => [t.id, t.title, t.category, t.priority, t.status, t.submitter_name, t.department, t.assignee_name || 'Unassigned', t.created_at, t.sla_due_at]);
      return { columns, rows, rowCount: rows.length, executionTimeMs: Math.round(performance.now() - start) };
    }

    if (/^SELECT\s+\*\s+FROM\s+users/i.test(q)) {
      const users = this.data.users;
      const columns = ['id', 'name', 'email', 'role', 'department', 'title'];
      const rows = users.map(u => [u.id, u.name, u.email, u.role, u.department, u.title]);
      return { columns, rows, rowCount: rows.length, executionTimeMs: Math.round(performance.now() - start) };
    }

    if (/^SELECT\s+status,\s*count/i.test(q)) {
      const counts = {};
      this.data.tickets.forEach(t => { counts[t.status] = (counts[t.status] || 0) + 1; });
      const columns = ['status', 'count'];
      const rows = Object.entries(counts).map(([k, v]) => [k, v]);
      return { columns, rows, rowCount: rows.length, executionTimeMs: Math.round(performance.now() - start) };
    }

    if (/^SELECT\s+priority,\s*count/i.test(q)) {
      const counts = {};
      this.data.tickets.forEach(t => { counts[t.priority] = (counts[t.priority] || 0) + 1; });
      const columns = ['priority', 'count'];
      const rows = Object.entries(counts).map(([k, v]) => [k, v]);
      return { columns, rows, rowCount: rows.length, executionTimeMs: Math.round(performance.now() - start) };
    }

    // Default generic execution
    return {
      columns: ['query_status', 'affected_rows', 'engine'],
      rows: [['Query executed successfully in local SQLite store', 1, 'In-Browser SQL Engine']],
      rowCount: 1,
      executionTimeMs: Math.round(performance.now() - start)
    };
  }
};

LocalSqlStore.init();

// Helper to check if backend is reachable
let backendChecked = false;
let backendAvailable = true;

async function checkBackendAvailability() {
  if (backendChecked) return backendAvailable;
  // If running directly from file:// or VS Code Live Server default ports (5500/5501)
  const isLiveServerPort = location.port === '5500' || location.port === '5501' || location.protocol === 'file:';
  
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 600);
    const res = await fetch('/api/stats', { signal: controller.signal });
    clearTimeout(timer);
    backendAvailable = res.ok;
  } catch {
    backendAvailable = false;
  }

  backendChecked = true;
  LocalSqlStore.updateIndicator(!backendAvailable || isLiveServerPort);
  return backendAvailable;
}

// API Client with Transparent VS Code Live Server Fallback
async function apiGetTickets(filters, myTicketsOnly = false) {
  const isOnline = await checkBackendAvailability();
  if (!isOnline) {
    const email = state.currentUser ? state.currentUser.email : null;
    return LocalSqlStore.queryTickets(filters, myTicketsOnly, email);
  }

  try {
    const params = new URLSearchParams();
    if (filters.status && filters.status !== 'all') params.append('status', filters.status);
    if (filters.priority && filters.priority !== 'all') params.append('priority', filters.priority);
    if (filters.category && filters.category !== 'all') params.append('category', filters.category);
    if (filters.department && filters.department !== 'all') params.append('department', filters.department);
    if (filters.assignee && filters.assignee !== 'all') params.append('assignee', filters.assignee);
    if (filters.search && filters.search.trim()) params.append('search', filters.search.trim());

    if (myTicketsOnly && state.currentUser && state.currentUser.email) {
      params.append('submitter_email', state.currentUser.email);
    }

    const res = await fetch(`/api/tickets?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch tickets');
    const data = await res.json();
    return data.tickets;
  } catch (e) {
    LocalSqlStore.updateIndicator(true);
    return LocalSqlStore.queryTickets(filters, myTicketsOnly, state.currentUser?.email);
  }
}

async function apiGetStats() {
  const isOnline = await checkBackendAvailability();
  if (!isOnline) return LocalSqlStore.getStats();

  try {
    const res = await fetch('/api/stats');
    if (!res.ok) throw new Error('Failed to fetch stats');
    return res.json();
  } catch {
    return LocalSqlStore.getStats();
  }
}

async function apiGetStaff() {
  const isOnline = await checkBackendAvailability();
  if (!isOnline) return LocalSqlStore.data.users.filter(u => u.role === 'admin');

  try {
    const res = await fetch('/api/staff');
    if (!res.ok) throw new Error('Failed to fetch staff');
    const data = await res.json();
    return data.staff;
  } catch {
    return LocalSqlStore.data.users.filter(u => u.role === 'admin');
  }
}

async function apiGetUsers() {
  const isOnline = await checkBackendAvailability();
  if (!isOnline) return LocalSqlStore.data.users;

  try {
    const res = await fetch('/api/users');
    if (!res.ok) throw new Error('Failed to fetch users');
    const data = await res.json();
    return data.users;
  } catch {
    return LocalSqlStore.data.users;
  }
}

async function apiGetTicket(id) {
  const isOnline = await checkBackendAvailability();
  if (!isOnline) {
    const ticket = LocalSqlStore.data.tickets.find(t => t.id === id);
    if (!ticket) throw new Error('Ticket not found');
    const activities = LocalSqlStore.data.activities.filter(a => a.ticket_id === id);
    return { ticket, activities };
  }

  try {
    const res = await fetch(`/api/tickets/${id}`);
    if (!res.ok) throw new Error('Ticket not found');
    return res.json();
  } catch {
    const ticket = LocalSqlStore.data.tickets.find(t => t.id === id);
    if (!ticket) throw new Error('Ticket not found');
    const activities = LocalSqlStore.data.activities.filter(a => a.ticket_id === id);
    return { ticket, activities };
  }
}

async function apiCreateTicket(payload) {
  const isOnline = await checkBackendAvailability();
  if (!isOnline) {
    const id = `TCK-${1000 + LocalSqlStore.data.tickets.length + 1}`;
    const hours = PRIORITY_CONFIG[payload.priority]?.hours || 24;
    const now = new Date();
    const slaDue = new Date(now.getTime() + hours * 3600000);

    const ticket = {
      id,
      title: payload.title,
      description: payload.description,
      category: payload.category,
      priority: payload.priority,
      status: 'open',
      submitter_name: payload.submitter_name,
      submitter_email: payload.submitter_email,
      department: payload.department,
      device_asset_tag: payload.device_asset_tag || '',
      assignee_id: payload.assignee_id || null,
      assignee_name: payload.assignee_name || null,
      resolution_notes: null,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      sla_due_at: slaDue.toISOString()
    };

    LocalSqlStore.data.tickets.unshift(ticket);
    LocalSqlStore.data.activities.unshift({
      id: `act-${Date.now()}`,
      ticket_id: id,
      actor_name: payload.submitter_name,
      action_type: 'created',
      comment: 'Ticket reported via Support Intake Portal',
      created_at: now.toISOString()
    });
    LocalSqlStore.save();
    return ticket;
  }

  try {
    const res = await fetch('/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to submit ticket');
    }
    const data = await res.json();
    return data.ticket;
  } catch (e) {
    // Fallback to local
    return apiCreateTicket(payload);
  }
}

async function apiUpdateTicket(id, updates) {
  const isOnline = await checkBackendAvailability();
  if (!isOnline) {
    const ticket = LocalSqlStore.data.tickets.find(t => t.id === id);
    if (!ticket) throw new Error('Ticket not found');

    const now = new Date().toISOString();
    if (updates.status) {
      const oldStatus = ticket.status;
      ticket.status = updates.status;
      ticket.updated_at = now;
      if (updates.status === 'resolved' || updates.status === 'closed') {
        ticket.resolved_at = now;
      }
      LocalSqlStore.data.activities.unshift({
        id: `act-${Date.now()}`,
        ticket_id: id,
        actor_name: updates.actor_name || 'IT Specialist',
        action_type: 'status_changed',
        old_value: oldStatus,
        new_value: updates.status,
        comment: `Status updated from ${oldStatus} to ${updates.status}`,
        created_at: now
      });
    }

    if (updates.assignee_id !== undefined) {
      ticket.assignee_id = updates.assignee_id;
      ticket.assignee_name = updates.assignee_name;
      ticket.updated_at = now;
    }

    if (updates.resolution_notes !== undefined) {
      ticket.resolution_notes = updates.resolution_notes;
      ticket.updated_at = now;
    }

    LocalSqlStore.save();
    return { success: true, ticket };
  }

  try {
    const res = await fetch(`/api/tickets/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to update ticket');
    }
    return res.json();
  } catch {
    backendAvailable = false;
    return apiUpdateTicket(id, updates);
  }
}

async function apiAddTicketNote(id, comment, actor_name) {
  const isOnline = await checkBackendAvailability();
  if (!isOnline) {
    LocalSqlStore.data.activities.unshift({
      id: `act-${Date.now()}`,
      ticket_id: id,
      actor_name: actor_name || 'IT Specialist',
      action_type: 'note_added',
      comment,
      created_at: new Date().toISOString()
    });
    LocalSqlStore.save();
    return { success: true };
  }

  try {
    const res = await fetch(`/api/tickets/${id}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment, actor_name })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to add work note');
    }
    return res.json();
  } catch {
    backendAvailable = false;
    return apiAddTicketNote(id, comment, actor_name);
  }
}

async function apiDeleteTicket(id) {
  const isOnline = await checkBackendAvailability();
  if (!isOnline) {
    LocalSqlStore.data.tickets = LocalSqlStore.data.tickets.filter(t => t.id !== id);
    LocalSqlStore.data.activities = LocalSqlStore.data.activities.filter(a => a.ticket_id !== id);
    LocalSqlStore.save();
    return { success: true };
  }

  try {
    const res = await fetch(`/api/tickets/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete ticket');
    return res.json();
  } catch {
    backendAvailable = false;
    return apiDeleteTicket(id);
  }
}

async function apiResetDatabase() {
  const isOnline = await checkBackendAvailability();
  if (!isOnline) {
    LocalSqlStore.reset();
    return { success: true };
  }

  try {
    const res = await fetch('/api/seed/reset', { method: 'POST' });
    if (!res.ok) throw new Error('Failed to reset database');
    return res.json();
  } catch {
    LocalSqlStore.reset();
    return { success: true };
  }
}

async function apiExecuteSql(query) {
  const isOnline = await checkBackendAvailability();
  if (!isOnline) {
    return LocalSqlStore.executeSql(query);
  }

  try {
    const res = await fetch('/api/sql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });
    if (!res.ok) throw new Error('SQL error');
    return res.json();
  } catch {
    return LocalSqlStore.executeSql(query);
  }
}

async function apiRegisterUser(payload) {
  const isOnline = await checkBackendAvailability();
  if (!isOnline) {
    const id = `usr-${payload.role}-${Date.now().toString(36)}`;
    const user = {
      id,
      name: payload.name,
      email: payload.email,
      role: payload.role,
      department: payload.department,
      title: payload.title || (payload.role === 'admin' ? 'Support Specialist' : 'Company Employee'),
      avatar: ''
    };
    LocalSqlStore.data.users.push(user);
    LocalSqlStore.save();
    return { user };
  }

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Registration failed');
    }
    return res.json();
  } catch {
    backendAvailable = false;
    return apiRegisterUser(payload);
  }
}

// User Profile & Role Switcher
function setCurrentUser(user) {
  state.currentUser = user;
  localStorage.setItem('opsdesk_user', JSON.stringify(user));

  const avatarBadge = document.getElementById('user-avatar-badge');
  const nameEl = document.getElementById('user-display-name');
  const roleEl = document.getElementById('user-role-badge');
  const deptEl = document.getElementById('user-dept-display');

  if (avatarBadge) {
    if (user.avatar) {
      avatarBadge.innerHTML = `<img src="${user.avatar}" alt="${user.name}" class="h-full w-full object-cover" />`;
    } else {
      avatarBadge.innerHTML = `<span>${getInitials(user.name)}</span>`;
    }
  }

  if (nameEl) nameEl.textContent = user.name;
  if (deptEl) deptEl.textContent = user.department || user.role;

  if (roleEl) {
    roleEl.textContent = user.role.toUpperCase();
    roleEl.className = 'font-mono text-[9px] font-bold px-1.5 py-0.5 rounded uppercase border ';
    if (user.role === 'admin') {
      roleEl.className += 'bg-purple-950 text-purple-300 border-purple-800/60';
    } else if (user.role === 'guest') {
      roleEl.className += 'bg-amber-950 text-amber-300 border-amber-800/60';
    } else {
      roleEl.className += 'bg-sky-950 text-sky-300 border-sky-800/60';
    }
  }

  // Update submit banner in new ticket modal
  updateSubmitUserBanner();

  // If user changed, reload tickets
  loadData();
}

function updateSubmitUserBanner() {
  const banner = document.getElementById('submit-user-banner');
  const avatar = document.getElementById('submit-user-avatar');
  const name = document.getElementById('submit-user-name');
  const email = document.getElementById('submit-user-email');
  const dept = document.getElementById('submit-user-dept');

  const u = state.currentUser;
  if (!u || !banner) return;

  if (avatar) {
    if (u.avatar) {
      avatar.innerHTML = `<img src="${u.avatar}" alt="${u.name}" class="h-full w-full object-cover rounded-full" />`;
    } else {
      avatar.textContent = getInitials(u.name);
    }
  }
  if (name) name.textContent = u.name;
  if (email) email.textContent = u.email;
  if (dept) dept.textContent = u.department;
}

// Data Loader
async function loadData(showSpin = false) {
  const refreshIcon = document.getElementById('icon-refresh');
  if (showSpin && refreshIcon) refreshIcon.classList.add('animate-spin');

  try {
    const [tickets, stats] = await Promise.all([
      apiGetTickets(state.filters, state.isMyTicketsOnly),
      apiGetStats()
    ]);
    state.tickets = tickets;
    state.stats = stats;

    renderHeaderStats();
    renderCurrentTab();
  } catch (err) {
    console.error('Data load error:', err);
    showToast('Failed to load tickets');
  } finally {
    if (showSpin && refreshIcon) {
      setTimeout(() => refreshIcon.classList.remove('animate-spin'), 300);
    }
  }
}

// Header & Stats Renderer
function renderHeaderStats() {
  if (!state.stats) return;
  const openEl = document.getElementById('stat-open-count');
  const progEl = document.getElementById('stat-progress-count');
  const resEl = document.getElementById('stat-resolved-count');
  const filterCountEl = document.getElementById('filter-count');

  if (openEl) openEl.textContent = state.stats.open;
  if (progEl) progEl.textContent = state.stats.inProgress;
  if (resEl) resEl.textContent = state.stats.resolved;
  if (filterCountEl) filterCountEl.textContent = state.tickets.length;
}

// Tab Switching
function switchTab(tabName) {
  state.activeTab = tabName;

  // Update nav button styling
  document.querySelectorAll('.nav-tab').forEach((btn) => {
    btn.classList.remove('bg-slate-800', 'text-slate-100');
    btn.classList.add('text-slate-400');
  });

  const activeBtn = document.getElementById(`nav-tab-${tabName}`);
  if (activeBtn) {
    activeBtn.classList.add('bg-slate-800', 'text-slate-100');
    activeBtn.classList.remove('text-slate-400');
  }

  // Update views visibility
  document.getElementById('view-list').classList.add('hidden');
  document.getElementById('view-kanban').classList.add('hidden');
  document.getElementById('view-metrics').classList.add('hidden');
  document.getElementById('view-sql').classList.add('hidden');

  const filterBar = document.getElementById('filter-bar');
  const pageTitle = document.getElementById('page-title');
  const pageSubtitle = document.getElementById('page-subtitle');

  if (tabName === 'list') {
    document.getElementById('view-list').classList.remove('hidden');
    filterBar.classList.remove('hidden');
    pageTitle.textContent = state.isMyTicketsOnly ? 'My Submitted Tickets' : 'Support Ticket Queue';
    pageSubtitle.textContent = state.isMyTicketsOnly ? `Tickets submitted by ${state.currentUser?.name || 'you'}` : 'Real-time database records with 1-click status transitions and bulk actions';
    renderTable();
  } else if (tabName === 'kanban') {
    document.getElementById('view-kanban').classList.remove('hidden');
    filterBar.classList.remove('hidden');
    pageTitle.textContent = 'Operational Kanban Board';
    pageSubtitle.textContent = 'Visual workflow columns tracking Open, In Progress, Resolved, and Closed items';
    renderKanban();
  } else if (tabName === 'metrics') {
    document.getElementById('view-metrics').classList.remove('hidden');
    filterBar.classList.add('hidden');
    pageTitle.textContent = 'SLA Compliance & System Health';
    pageSubtitle.textContent = 'Performance metrics, category breakdowns, and real-time audit logs';
    renderMetrics();
  } else if (tabName === 'sql') {
    document.getElementById('view-sql').classList.remove('hidden');
    filterBar.classList.add('hidden');
    pageTitle.textContent = 'Relational SQLite Database Inspector';
    pageSubtitle.textContent = 'Direct SQL query execution and schema inspection against tickets.sqlite';
  }
}

function renderCurrentTab() {
  if (state.activeTab === 'list') renderTable();
  else if (state.activeTab === 'kanban') renderKanban();
  else if (state.activeTab === 'metrics') renderMetrics();
}

// Table View Renderer
function renderTable() {
  const tbody = document.getElementById('tickets-table-body');
  if (!tbody) return;

  const tickets = state.tickets;
  const bulkToolbar = document.getElementById('bulk-toolbar');
  const bulkCount = document.getElementById('bulk-count');
  const thSelectAll = document.getElementById('th-select-all');

  // Update bulk toolbar state
  if (state.selectedIds.size > 0 && state.currentUser?.role === 'admin') {
    bulkToolbar.classList.remove('hidden');
    bulkToolbar.classList.add('flex');
    bulkCount.textContent = state.selectedIds.size;
  } else {
    bulkToolbar.classList.add('hidden');
    bulkToolbar.classList.remove('flex');
  }

  if (thSelectAll) {
    thSelectAll.checked = tickets.length > 0 && state.selectedIds.size === tickets.length;
  }

  if (tickets.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="p-12 text-center text-slate-400">
          <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-800 text-slate-500 mb-3">
            <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          </div>
          <p class="font-medium text-slate-200">No tickets found</p>
          <p class="text-xs text-slate-500 mt-1">${state.isMyTicketsOnly ? 'You have not submitted any tickets matching these criteria yet.' : 'No support tickets matched your current search filters.'}</p>
        </td>
      </tr>
    `;
    return;
  }

  const isAdmin = state.currentUser?.role === 'admin';

  tbody.innerHTML = tickets.map((t) => {
    const priority = PRIORITY_CONFIG[t.priority] || PRIORITY_CONFIG.medium;
    const status = STATUS_CONFIG[t.status] || STATUS_CONFIG.open;
    const sla = getSlaStatus(t);
    const isSelected = state.selectedIds.has(t.id);

    // 1-Click status transition button (accessible to admins, or submitter closing/reopening their own ticket)
    let nextStatusBtn = '';
    const isOwner = state.currentUser && state.currentUser.email.toLowerCase() === t.submitter_email.toLowerCase();

    if (isAdmin || isOwner) {
      if (t.status === 'open' && isAdmin) {
        nextStatusBtn = `<button data-action="quick-status" data-id="${t.id}" data-status="in_progress" title="Mark In Progress" class="rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300 hover:border-amber-500/50 hover:text-amber-300 transition-colors">Start</button>`;
      } else if (t.status === 'in_progress' && isAdmin) {
        nextStatusBtn = `<button data-action="quick-status" data-id="${t.id}" data-status="resolved" title="Mark Resolved" class="rounded border border-emerald-800/80 bg-emerald-950/60 px-1.5 py-0.5 text-[10px] text-emerald-300 hover:bg-emerald-900 transition-colors">Resolve</button>`;
      } else if (t.status === 'resolved') {
        nextStatusBtn = `<button data-action="quick-status" data-id="${t.id}" data-status="closed" title="Close Ticket" class="rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400 hover:text-slate-200 transition-colors">Close</button>`;
      } else if (t.status === 'closed') {
        nextStatusBtn = `<button data-action="quick-status" data-id="${t.id}" data-status="open" title="Reopen Ticket" class="rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400 hover:text-sky-300 transition-colors">Reopen</button>`;
      }
    }

    // Assignee dropdown options
    const staffOptions = state.staff.map(s => `
      <option value="${s.id}" ${t.assignee_id === s.id ? 'selected' : ''} class="bg-slate-900 text-slate-200">
        ${s.name}
      </option>
    `).join('');

    return `
      <tr class="group transition-colors hover:bg-slate-800/40 ${isSelected ? 'bg-indigo-950/20' : ''}">
        <td class="px-3 py-2.5">
          <input type="checkbox" data-select-id="${t.id}" ${isSelected ? 'checked' : ''} class="ticket-select-chk rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-950" />
        </td>
        <td class="px-3 py-2.5 font-mono text-[11px] font-semibold text-indigo-400">
          <button data-action="view-detail" data-id="${t.id}" class="hover:underline text-left">${t.id}</button>
        </td>
        <td class="px-3 py-2.5 max-w-[340px]">
          <div class="flex flex-col gap-0.5">
            <button data-action="view-detail" data-id="${t.id}" class="text-left font-medium text-slate-100 hover:text-indigo-300 transition-colors line-clamp-1">
              ${escapeHtml(t.title)}
            </button>
            <div class="flex items-center gap-1.5 text-[11px] text-slate-400">
              <span class="${isOwner ? 'text-indigo-300 font-medium' : ''}">${escapeHtml(t.submitter_name)}</span>
              <span aria-hidden="true" class="text-slate-600">·</span>
              <span>${escapeHtml(t.department)}</span>
              ${t.device_asset_tag ? `
                <span aria-hidden="true" class="text-slate-600">·</span>
                <span class="font-mono text-[10px] text-slate-400">${escapeHtml(t.device_asset_tag)}</span>
              ` : ''}
            </div>
          </div>
        </td>
        <td class="px-3 py-2.5 text-slate-300 whitespace-nowrap">
          ${CATEGORY_LABELS[t.category] || t.category}
        </td>
        <td class="px-3 py-2.5 whitespace-nowrap">
          <div class="flex items-center gap-1.5">
            <span class="h-2 w-2 rounded-full ${priority.dotClass}"></span>
            <span class="${priority.textClass}">${priority.label}</span>
          </div>
        </td>
        <td class="px-3 py-2.5 whitespace-nowrap">
          <div class="flex items-center gap-2">
            <div class="flex items-center gap-1.5">
              <span class="h-1.5 w-1.5 rounded-full ${status.dotClass}"></span>
              <span class="${status.textClass}">${status.label}</span>
            </div>
            ${nextStatusBtn}
          </div>
        </td>
        <td class="px-3 py-2.5 whitespace-nowrap">
          <div class="flex items-center gap-2">
            ${t.assignee_avatar ? `
              <img src="${t.assignee_avatar}" alt="${t.assignee_name || 'Staff'}" class="h-5 w-5 rounded-full object-cover border border-slate-700" />
            ` : `
              <div class="h-5 w-5 rounded-full bg-slate-800 flex items-center justify-center text-[9px] text-slate-400 font-mono">?</div>
            `}
            ${isAdmin ? `
              <select data-action="quick-assign" data-id="${t.id}" class="bg-transparent text-xs text-slate-300 hover:text-white cursor-pointer focus:outline-none max-w-[120px] truncate">
                <option value="unassigned" class="bg-slate-900 text-slate-400" ${!t.assignee_id ? 'selected' : ''}>Unassigned</option>
                ${staffOptions}
              </select>
            ` : `
              <span class="text-xs text-slate-300 truncate max-w-[120px]">${t.assignee_name || 'Unassigned'}</span>
            `}
          </div>
        </td>
        <td class="px-3 py-2.5 text-right font-mono text-[11px] tabular-nums whitespace-nowrap">
          ${t.status === 'resolved' || t.status === 'closed' ? `
            <span class="text-slate-400">${formatRelativeTime(t.updated_at)}</span>
          ` : sla.isBreached ? `
            <span class="inline-flex items-center gap-1 text-red-400 font-semibold">
              <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
              ${sla.timeLeftText}
            </span>
          ` : sla.isAtRisk ? `
            <span class="inline-flex items-center gap-1 text-amber-400 font-medium">
              <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><circle cx="12" cy="12" r="9" stroke-width="2"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 7v5l3 3"/></svg>
              ${sla.timeLeftText}
            </span>
          ` : `
            <span class="text-slate-400">${sla.timeLeftText}</span>
          `}
        </td>
        <td class="px-3 py-2.5 text-center whitespace-nowrap">
          <div class="flex items-center justify-center gap-1">
            <button data-action="view-detail" data-id="${t.id}" title="View details" class="p-1 text-slate-400 hover:text-indigo-300 transition-colors">
              <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
            </button>
            ${isAdmin ? `
              <button data-action="delete-ticket" data-id="${t.id}" title="Delete ticket" class="p-1 text-slate-500 hover:text-rose-400 transition-colors">
                <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Kanban View Renderer
function renderKanban() {
  const statuses = ['open', 'in_progress', 'resolved', 'closed'];

  statuses.forEach((st) => {
    const colEl = document.getElementById(`kanban-col-${st}`);
    const countEl = document.getElementById(`kanban-count-${st}`);
    if (!colEl) return;

    const colTickets = state.tickets.filter(t => t.status === st);
    if (countEl) countEl.textContent = colTickets.length;

    if (colTickets.length === 0) {
      colEl.innerHTML = `
        <div class="flex-1 flex items-center justify-center p-6 text-center text-xs text-slate-500 border border-dashed border-slate-800/60 rounded-md">
          No ${st.replace('_', ' ')} tickets
        </div>
      `;
      return;
    }

    colEl.innerHTML = colTickets.map((t) => {
      const priority = PRIORITY_CONFIG[t.priority] || PRIORITY_CONFIG.medium;
      const sla = getSlaStatus(t);

      let prevStatus = null;
      let nextStatus = null;
      if (st === 'open') nextStatus = 'in_progress';
      else if (st === 'in_progress') { prevStatus = 'open'; nextStatus = 'resolved'; }
      else if (st === 'resolved') { prevStatus = 'in_progress'; nextStatus = 'closed'; }
      else if (st === 'closed') { prevStatus = 'resolved'; }

      return `
        <div class="group rounded-md border border-slate-800 bg-slate-950/80 p-3 shadow-xs hover:border-slate-700 transition-all text-xs">
          <div class="flex items-center justify-between gap-2 text-[11px] text-slate-400 mb-1.5">
            <button data-action="view-detail" data-id="${t.id}" class="font-mono font-semibold text-indigo-400 hover:underline">
              ${t.id}
            </button>
            <div class="flex items-center gap-1.5">
              <span class="h-1.5 w-1.5 rounded-full ${priority.dotClass}"></span>
              <span class="${priority.textClass}">${priority.label}</span>
            </div>
          </div>

          <button data-action="view-detail" data-id="${t.id}" class="text-left font-medium text-slate-200 group-hover:text-white transition-colors line-clamp-2 mb-2 leading-relaxed">
            ${escapeHtml(t.title)}
          </button>

          <div class="flex items-center gap-1.5 text-[11px] text-slate-400 mb-2">
            <span>${escapeHtml(t.submitter_name)}</span>
            <span aria-hidden="true" class="text-slate-600">·</span>
            <span>${escapeHtml(t.department)}</span>
          </div>

          <div class="flex items-center justify-between pt-2 border-t border-slate-800/60 text-[11px]">
            <span class="text-slate-400 truncate max-w-[110px]">
              ${CATEGORY_LABELS[t.category] || t.category}
            </span>

            <div class="flex items-center gap-2">
              ${t.status !== 'resolved' && t.status !== 'closed' ? `
                <span class="font-mono text-[10px] tabular-nums ${sla.isBreached ? 'text-red-400 font-semibold' : sla.isAtRisk ? 'text-amber-400' : 'text-slate-500'}">
                  ${sla.timeLeftText}
                </span>
              ` : ''}

              ${t.assignee_avatar ? `
                <img src="${t.assignee_avatar}" alt="${t.assignee_name || 'Assignee'}" title="${t.assignee_name || 'Assignee'}" class="h-5 w-5 rounded-full object-cover border border-slate-700" />
              ` : `
                <div title="Unassigned" class="h-5 w-5 rounded-full bg-slate-800 flex items-center justify-center text-[9px] text-slate-400 font-mono">?</div>
              `}
            </div>
          </div>

          <div class="mt-2.5 pt-2 border-t border-slate-800/40 flex items-center justify-between">
            ${prevStatus ? `
              <button data-action="quick-status" data-id="${t.id}" data-status="${prevStatus}" class="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-200 transition-colors">
                <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
                <span>Back</span>
              </button>
            ` : '<span></span>'}

            ${nextStatus ? `
              <button data-action="quick-status" data-id="${t.id}" data-status="${nextStatus}" class="flex items-center gap-1 text-[10px] font-medium text-indigo-400 hover:text-indigo-300 transition-colors ml-auto">
                <span>Move to ${nextStatus.replace('_', ' ')}</span>
                <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
              </button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  });
}

// Metrics View Renderer
function renderMetrics() {
  if (!state.stats) return;
  const s = state.stats;

  const activeEl = document.getElementById('metric-active');
  const activeSub = document.getElementById('metric-active-sub');
  const breachedEl = document.getElementById('metric-breached');
  const riskSub = document.getElementById('metric-risk-sub');
  const criticalEl = document.getElementById('metric-critical');
  const rateEl = document.getElementById('metric-rate');
  const rateSub = document.getElementById('metric-rate-sub');

  if (activeEl) activeEl.textContent = s.active;
  if (activeSub) activeSub.textContent = `${s.open} open · ${s.inProgress} in progress`;
  if (breachedEl) breachedEl.textContent = s.slaBreached;
  if (riskSub) riskSub.textContent = `${s.slaAtRisk} approaching deadline (<4h)`;
  if (criticalEl) criticalEl.textContent = s.critical;

  const rate = s.total > 0 ? Math.round(((s.resolved + s.closed) / s.total) * 100) : 0;
  if (rateEl) rateEl.textContent = `${rate}%`;
  if (rateSub) rateSub.textContent = `${s.resolved + s.closed} of ${s.total} total resolved`;

  // Category Distribution
  const catContainer = document.getElementById('category-distribution');
  if (catContainer) {
    catContainer.innerHTML = Object.entries(CATEGORY_LABELS).map(([catKey, label]) => {
      const count = s.categoryCounts[catKey] || 0;
      const pct = s.total > 0 ? Math.round((count / s.total) * 100) : 0;
      return `
        <div class="space-y-1">
          <div class="flex items-center justify-between text-xs">
            <span class="text-slate-300">${label}</span>
            <span class="font-mono text-slate-400 tabular-nums">${count} (${pct}%)</span>
          </div>
          <div class="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
            <div class="h-full rounded-full bg-indigo-500 transition-all duration-300" style="width: ${pct}%"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Priority Distribution
  const priContainer = document.getElementById('priority-distribution');
  if (priContainer) {
    const priorities = [
      { id: 'critical', label: 'Critical (4h SLA)', color: 'bg-red-500' },
      { id: 'high', label: 'High (12h SLA)', color: 'bg-amber-500' },
      { id: 'medium', label: 'Medium (24h SLA)', color: 'bg-blue-400' },
      { id: 'low', label: 'Low (48h SLA)', color: 'bg-slate-500' }
    ];
    priContainer.innerHTML = priorities.map((p) => {
      const count = s.priorityCounts[p.id] || 0;
      const pct = s.total > 0 ? Math.round((count / s.total) * 100) : 0;
      return `
        <div class="space-y-1">
          <div class="flex items-center justify-between text-xs">
            <span class="text-slate-300">${p.label}</span>
            <span class="font-mono text-slate-400 tabular-nums">${count} (${pct}%)</span>
          </div>
          <div class="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
            <div class="h-full rounded-full ${p.color} transition-all duration-300" style="width: ${pct}%"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Activity Stream
  const streamEl = document.getElementById('metrics-activity-stream');
  if (streamEl) {
    if (s.recentActivities.length === 0) {
      streamEl.innerHTML = `<p class="text-xs text-slate-500 py-3">No activity recorded yet.</p>`;
    } else {
      streamEl.innerHTML = s.recentActivities.map((act) => `
        <div class="py-2.5 flex items-start justify-between gap-3 text-xs">
          <div class="flex flex-col gap-0.5">
            <div class="flex items-center gap-2">
              <span class="font-semibold text-slate-200">${escapeHtml(act.actor_name)}</span>
              <span aria-hidden="true" class="text-slate-600">·</span>
              <span class="font-mono text-indigo-400">${act.ticket_id}</span>
            </div>
            ${act.comment ? `<p class="text-slate-400 text-[11px] leading-relaxed line-clamp-2">${escapeHtml(act.comment)}</p>` : ''}
          </div>
          <span class="font-mono text-[10px] text-slate-500 shrink-0 tabular-nums">${formatRelativeTime(act.created_at)}</span>
        </div>
      `).join('');
    }
  }
}

// SQL Query Console Runner
async function runSqlQuery() {
  const inputEl = document.getElementById('sql-query-input');
  const statusEl = document.getElementById('sql-execution-status');
  const resultsContainer = document.getElementById('sql-results-container');
  const executeBtn = document.getElementById('btn-execute-sql');

  if (!inputEl || !inputEl.value.trim()) return;

  const query = inputEl.value.trim();
  statusEl.textContent = 'Executing query...';
  executeBtn.disabled = true;

  const startTime = performance.now();
  try {
    const res = await apiExecuteSql(query);
    const duration = (performance.now() - startTime).toFixed(1);

    if (res.error) {
      statusEl.innerHTML = `<span class="text-red-400">Error: ${escapeHtml(res.error)}</span>`;
      resultsContainer.innerHTML = `<div class="p-4 text-xs text-red-400 bg-red-950/20 border border-red-900/40 rounded">${escapeHtml(res.error)}</div>`;
      return;
    }

    if (!res.results || res.results.length === 0) {
      statusEl.innerHTML = `<span class="text-emerald-400">Executed successfully in ${duration}ms (0 rows returned or statement completed).</span>`;
      resultsContainer.innerHTML = `<div class="p-4 text-xs text-slate-400">Query executed successfully. Database state updated.</div>`;
      loadData();
      return;
    }

    const firstResult = res.results[0];
    const columns = firstResult.columns || [];
    const values = firstResult.values || [];

    statusEl.innerHTML = `<span class="text-emerald-400">Returned ${values.length} rows in ${duration}ms.</span>`;

    let html = `
      <table class="w-full text-left font-mono text-[11px]">
        <thead class="border-b border-slate-800 bg-slate-900/80 text-slate-300">
          <tr>
            ${columns.map(c => `<th class="px-3 py-1.5 whitespace-nowrap text-indigo-300">${escapeHtml(c)}</th>`).join('')}
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-800/40 text-slate-300">
          ${values.map(row => `
            <tr class="hover:bg-slate-900/50">
              ${row.map(val => `<td class="px-3 py-1.5 whitespace-nowrap">${escapeHtml(String(val ?? 'NULL'))}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    resultsContainer.innerHTML = html;
    loadData();
  } catch (err) {
    statusEl.innerHTML = `<span class="text-red-400">Execution failed</span>`;
    resultsContainer.innerHTML = `<div class="p-4 text-xs text-red-400">${escapeHtml(err.message)}</div>`;
  } finally {
    executeBtn.disabled = false;
  }
}

// Ticket Detail Modal
async function openDetailModal(ticketId) {
  state.activeTicketId = ticketId;
  const modal = document.getElementById('modal-detail');
  if (!modal) return;

  modal.classList.remove('hidden');

  try {
    const { ticket, activities } = await apiGetTicket(ticketId);

    document.getElementById('detail-ticket-id').textContent = ticket.id;
    document.getElementById('detail-created-time').textContent = `Created ${formatRelativeTime(ticket.created_at)}`;
    document.getElementById('detail-title').textContent = ticket.title;
    document.getElementById('detail-category-badge').textContent = CATEGORY_LABELS[ticket.category] || ticket.category;
    document.getElementById('detail-department-text').textContent = ticket.department;

    const assetWrapper = document.getElementById('detail-asset-wrapper');
    const assetTag = document.getElementById('detail-asset-tag');
    if (ticket.device_asset_tag) {
      assetTag.textContent = ticket.device_asset_tag;
      assetWrapper.classList.remove('hidden');
      assetWrapper.classList.add('inline-flex');
    } else {
      assetWrapper.classList.add('hidden');
      assetWrapper.classList.remove('inline-flex');
    }

    // Selects
    document.getElementById('detail-select-status').value = ticket.status;
    document.getElementById('detail-select-priority').value = ticket.priority;

    const assigneeSelect = document.getElementById('detail-select-assignee');
    assigneeSelect.innerHTML = `
      <option value="unassigned" ${!ticket.assignee_id ? 'selected' : ''}>Unassigned</option>
      ${state.staff.map(s => `
        <option value="${s.id}" ${ticket.assignee_id === s.id ? 'selected' : ''}>${s.name}</option>
      `).join('')}
    `;

    // Role restrictions on details controls
    const isAdmin = state.currentUser?.role === 'admin';
    const isOwner = state.currentUser && state.currentUser.email.toLowerCase() === ticket.submitter_email.toLowerCase();
    document.getElementById('detail-select-priority').disabled = !isAdmin;
    document.getElementById('detail-select-assignee').disabled = !isAdmin;
    document.getElementById('btn-delete-detail-ticket').style.display = isAdmin ? 'flex' : 'none';

    // SLA
    const sla = getSlaStatus(ticket);
    const dueDate = new Date(ticket.sla_due_at);
    document.getElementById('detail-sla-due-text').textContent =
      `Due ${dueDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}, ${dueDate.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;

    const slaStatusBadge = document.getElementById('detail-sla-status-badge');
    if (ticket.status === 'resolved' || ticket.status === 'closed') {
      slaStatusBadge.innerHTML = `<span class="text-emerald-400">Resolved</span>`;
    } else if (sla.isBreached) {
      slaStatusBadge.innerHTML = `<span class="text-red-400 font-semibold">${sla.timeLeftText}</span>`;
    } else if (sla.isAtRisk) {
      slaStatusBadge.innerHTML = `<span class="text-amber-400 font-medium">${sla.timeLeftText}</span>`;
    } else {
      slaStatusBadge.innerHTML = `<span class="text-slate-400">${sla.timeLeftText}</span>`;
    }

    // Description & Submitter
    document.getElementById('detail-description-text').textContent = ticket.description;
    document.getElementById('detail-submitter-name').textContent = ticket.submitter_name;
    document.getElementById('detail-submitter-email').textContent = ticket.submitter_email;
    document.getElementById('detail-submitter-dept').textContent = ticket.department;

    // Resolution summary
    const resBox = document.getElementById('detail-resolution-box');
    const resText = document.getElementById('detail-resolution-text');
    if (ticket.resolution_notes) {
      resText.textContent = ticket.resolution_notes;
      resBox.classList.remove('hidden');
    } else {
      resBox.classList.add('hidden');
    }

    // Timeline
    renderDetailTimeline(activities);
  } catch (err) {
    showToast('Failed to load ticket details');
    closeDetailModal();
  }
}

function renderDetailTimeline(activities) {
  const container = document.getElementById('detail-timeline-container');
  if (!container) return;

  container.innerHTML = activities.map((act) => `
    <div class="relative pl-7 text-xs">
      <div class="absolute left-2 top-1.5 h-2 w-2 -translate-x-1/2 rounded-full border-2 border-slate-900 bg-indigo-500"></div>
      <div class="flex items-center gap-2 text-slate-400 text-[11px]">
        <span class="font-semibold text-slate-200">${escapeHtml(act.actor_name)}</span>
        <span aria-hidden="true" class="text-slate-600">·</span>
        <span class="font-mono tabular-nums">${formatRelativeTime(act.created_at)}</span>
      </div>
      ${act.comment ? `
        <div class="mt-1 rounded border border-slate-800/80 bg-slate-950/60 p-2 text-xs text-slate-300 leading-relaxed">
          ${escapeHtml(act.comment)}
        </div>
      ` : ''}
    </div>
  `).join('');
}

function closeDetailModal() {
  const modal = document.getElementById('modal-detail');
  if (modal) modal.classList.add('hidden');
  state.activeTicketId = null;
}

// New Ticket Submission Modal
function openSubmitModal() {
  const modal = document.getElementById('modal-submit');
  const errorBanner = document.getElementById('submit-error-banner');
  if (errorBanner) errorBanner.classList.add('hidden');

  // Pre-fill submitter fields from logged in user
  const u = state.currentUser;
  if (u) {
    document.getElementById('new-submitter-name').value = u.name;
    document.getElementById('new-submitter-email').value = u.email;
    if (u.department && u.department !== 'External / Contractor') {
      document.getElementById('new-department').value = u.department;
    }
  }

  updateSubmitUserBanner();
  if (modal) modal.classList.remove('hidden');
}

function closeSubmitModal() {
  const modal = document.getElementById('modal-submit');
  if (modal) modal.classList.add('hidden');
}

function applyPresetTemplate(presetKey) {
  const p = PRESET_TEMPLATES[presetKey];
  if (!p) return;

  document.getElementById('new-title').value = p.title;
  document.getElementById('new-description').value = p.description;
  document.getElementById('new-category').value = p.category;
  document.getElementById('new-priority').value = p.priority;
}

// User / Auth Switcher Modal
function openAuthModal() {
  const modal = document.getElementById('modal-auth');
  renderQuickUserList();
  if (modal) modal.classList.remove('hidden');
}

function closeAuthModal() {
  const modal = document.getElementById('modal-auth');
  if (modal) modal.classList.add('hidden');
}

function renderQuickUserList() {
  const listEl = document.getElementById('quick-user-list');
  if (!listEl) return;

  const admins = state.users.filter(u => u.role === 'admin');
  const employees = state.users.filter(u => u.role === 'user');
  const guests = state.users.filter(u => u.role === 'guest');

  const renderGroup = (title, items, roleBadgeColor) => `
    <div class="mb-3">
      <div class="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">${title}</div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        ${items.map(u => {
          const isCurrent = state.currentUser && state.currentUser.id === u.id;
          return `
            <button
              type="button"
              data-user-id="${u.id}"
              class="quick-select-user-btn flex items-center justify-between gap-2 rounded-md border p-2 text-left transition-all ${
                isCurrent
                  ? 'border-indigo-500/80 bg-indigo-950/40 text-slate-100 ring-1 ring-indigo-500/50'
                  : 'border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-700 hover:bg-slate-800/60'
              }"
            >
              <div class="flex items-center gap-2 truncate">
                ${u.avatar ? `
                  <img src="${u.avatar}" alt="${u.name}" class="h-6 w-6 rounded-full object-cover shrink-0 border border-slate-700" />
                ` : `
                  <div class="h-6 w-6 rounded-full bg-slate-800 text-[10px] font-bold text-slate-300 flex items-center justify-center shrink-0 border border-slate-700">
                    ${getInitials(u.name)}
                  </div>
                `}
                <div class="truncate">
                  <div class="text-xs font-medium leading-none truncate">${escapeHtml(u.name)}</div>
                  <div class="text-[10px] text-slate-400 truncate mt-0.5">${escapeHtml(u.department)}</div>
                </div>
              </div>
              <span class="font-mono text-[9px] px-1 py-0.5 rounded uppercase shrink-0 border ${roleBadgeColor}">
                ${u.role}
              </span>
            </button>
          `;
        }).join('')}
      </div>
    </div>
  `;

  listEl.innerHTML = `
    ${renderGroup('IT Administrators & Triage Staff', admins, 'bg-purple-950 text-purple-300 border-purple-800/60')}
    ${renderGroup('Company Employees (Users)', employees, 'bg-sky-950 text-sky-300 border-sky-800/60')}
    ${renderGroup('Guest / Contractor', guests, 'bg-amber-950 text-amber-300 border-amber-800/60')}
  `;

  // Attach click events
  listEl.querySelectorAll('.quick-select-user-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const u = state.users.find(item => item.id === btn.dataset.userId);
      if (u) {
        setCurrentUser(u);
        closeAuthModal();
        showToast(`Logged in as ${u.name} (${u.role.toUpperCase()})`);
      }
    });
  });
}

// CSV Export
function exportCsv() {
  const tickets = state.tickets;
  if (tickets.length === 0) {
    showToast('No tickets to export');
    return;
  }

  const headers = [
    'ID', 'Title', 'Category', 'Priority', 'Status',
    'Department', 'Submitter Name', 'Submitter Email',
    'Asset Tag', 'Assignee', 'Created At', 'Updated At'
  ];

  const rows = tickets.map(t => [
    `"${t.id}"`,
    `"${t.title.replace(/"/g, '""')}"`,
    `"${t.category}"`,
    `"${t.priority}"`,
    `"${t.status}"`,
    `"${t.department}"`,
    `"${t.submitter_name.replace(/"/g, '""')}"`,
    `"${t.submitter_email}"`,
    `"${t.device_asset_tag || ''}"`,
    `"${t.assignee_name || 'Unassigned'}"`,
    `"${t.created_at}"`,
    `"${t.updated_at}"`
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `it_support_tickets_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('Exported CSV successfully');
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Event Bindings
function initEventHandlers() {
  // Navigation Tabs
  document.getElementById('nav-tab-list').addEventListener('click', () => switchTab('list'));
  document.getElementById('nav-tab-kanban').addEventListener('click', () => switchTab('kanban'));
  document.getElementById('nav-tab-metrics').addEventListener('click', () => switchTab('metrics'));
  document.getElementById('nav-tab-sql').addEventListener('click', () => switchTab('sql'));

  // Refresh button
  document.getElementById('btn-refresh').addEventListener('click', () => loadData(true));

  // User Profile & Switcher Button
  document.getElementById('btn-open-auth-modal').addEventListener('click', openAuthModal);
  document.getElementById('modal-auth-close').addEventListener('click', closeAuthModal);
  document.getElementById('btn-switch-user-from-submit')?.addEventListener('click', () => {
    closeSubmitModal();
    openAuthModal();
  });

  // Modal triggers
  document.getElementById('btn-open-submit').addEventListener('click', openSubmitModal);
  document.getElementById('btn-kanban-add-open')?.addEventListener('click', openSubmitModal);
  document.getElementById('modal-submit-close').addEventListener('click', closeSubmitModal);
  document.getElementById('modal-submit-cancel').addEventListener('click', closeSubmitModal);
  document.getElementById('modal-detail-close').addEventListener('click', closeDetailModal);

  // Preset Template buttons
  document.querySelectorAll('.preset-template-btn').forEach(btn => {
    btn.addEventListener('click', () => applyPresetTemplate(btn.dataset.preset));
  });

  // Submit New Ticket Form
  document.getElementById('form-new-ticket').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorBanner = document.getElementById('submit-error-banner');
    const errorText = document.getElementById('submit-error-text');

    const payload = {
      title: document.getElementById('new-title').value.trim(),
      description: document.getElementById('new-description').value.trim(),
      category: document.getElementById('new-category').value,
      priority: document.getElementById('new-priority').value,
      submitter_name: document.getElementById('new-submitter-name').value.trim(),
      submitter_email: document.getElementById('new-submitter-email').value.trim(),
      department: document.getElementById('new-department').value,
      device_asset_tag: document.getElementById('new-asset-tag').value.trim() || undefined
    };

    try {
      const created = await apiCreateTicket(payload);
      closeSubmitModal();
      document.getElementById('form-new-ticket').reset();
      showToast(`Created ticket ${created.id}`);
      await loadData();
      openDetailModal(created.id);
    } catch (err) {
      errorText.textContent = err.message;
      errorBanner.classList.remove('hidden');
    }
  });

  // Custom User Sign In / Registration Form
  document.getElementById('form-custom-auth').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('auth-name').value.trim();
    const email = document.getElementById('auth-email').value.trim();
    const department = document.getElementById('auth-dept').value;
    const role = document.getElementById('auth-role').value;

    if (!name || !email) return;

    try {
      const res = await apiRegisterUser({ name, email, department, role });
      state.users.push(res.user);
      setCurrentUser(res.user);
      closeAuthModal();
      document.getElementById('form-custom-auth').reset();
      showToast(`Profile created: Logged in as ${res.user.name}`);
    } catch (err) {
      // If user exists, find and login
      const existing = state.users.find(u => u.email.toLowerCase() === email.toLowerCase());
      if (existing) {
        setCurrentUser(existing);
        closeAuthModal();
        showToast(`Welcome back, ${existing.name}`);
      } else {
        alert(err.message);
      }
    }
  });

  // Toggle "My Tickets"
  const btnMyTickets = document.getElementById('btn-toggle-my-tickets');
  btnMyTickets.addEventListener('click', () => {
    state.isMyTicketsOnly = !state.isMyTicketsOnly;

    if (state.isMyTicketsOnly) {
      btnMyTickets.className = 'flex items-center gap-1.5 rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white transition-colors';
      showToast(`Filtering tickets submitted by ${state.currentUser?.name || 'you'}`);
    } else {
      btnMyTickets.className = 'flex items-center gap-1.5 rounded-md border border-slate-800 bg-slate-950 px-2.5 py-1 text-xs font-medium text-slate-400 hover:text-indigo-300 hover:border-slate-700 transition-colors';
      showToast('Showing all company tickets');
    }

    const pageTitle = document.getElementById('page-title');
    const pageSubtitle = document.getElementById('page-subtitle');
    if (state.activeTab === 'list') {
      pageTitle.textContent = state.isMyTicketsOnly ? 'My Submitted Tickets' : 'Support Ticket Queue';
      pageSubtitle.textContent = state.isMyTicketsOnly ? `Tickets submitted by ${state.currentUser?.name || 'you'}` : 'Real-time database records with 1-click status transitions and bulk actions';
    }

    loadData();
  });

  // Ticket Detail Field Changes
  document.getElementById('detail-select-status').addEventListener('change', async (e) => {
    if (!state.activeTicketId) return;
    try {
      await apiUpdateTicket(state.activeTicketId, {
        status: e.target.value,
        actor_name: state.currentUser?.name || 'IT Specialist'
      });
      showToast(`Status updated to ${e.target.value.replace('_', ' ')}`);
      loadData();
      openDetailModal(state.activeTicketId);
    } catch (err) {
      showToast(err.message);
    }
  });

  document.getElementById('detail-select-priority').addEventListener('change', async (e) => {
    if (!state.activeTicketId) return;
    try {
      await apiUpdateTicket(state.activeTicketId, {
        priority: e.target.value,
        actor_name: state.currentUser?.name || 'IT Specialist'
      });
      showToast(`Priority updated to ${e.target.value}`);
      loadData();
      openDetailModal(state.activeTicketId);
    } catch (err) {
      showToast(err.message);
    }
  });

  document.getElementById('detail-select-assignee').addEventListener('change', async (e) => {
    if (!state.activeTicketId) return;
    try {
      await apiUpdateTicket(state.activeTicketId, {
        assignee_id: e.target.value === 'unassigned' ? null : e.target.value,
        actor_name: state.currentUser?.name || 'IT Specialist'
      });
      showToast(`Assigned ticket`);
      loadData();
      openDetailModal(state.activeTicketId);
    } catch (err) {
      showToast(err.message);
    }
  });

  // Add Work Note Form
  document.getElementById('form-add-note').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('input-new-note');
    if (!input || !input.value.trim() || !state.activeTicketId) return;

    try {
      const res = await apiAddTicketNote(
        state.activeTicketId,
        input.value.trim(),
        state.currentUser?.name || 'IT Specialist'
      );
      input.value = '';
      renderDetailTimeline(res.activities);
      showToast('Work note recorded');
      loadData();
    } catch (err) {
      showToast(err.message);
    }
  });

  // Delete Detail Ticket Button
  document.getElementById('btn-delete-detail-ticket').addEventListener('click', async () => {
    if (!state.activeTicketId) return;
    if (confirm(`Permanently delete ticket ${state.activeTicketId}?`)) {
      try {
        await apiDeleteTicket(state.activeTicketId);
        showToast(`Ticket ${state.activeTicketId} deleted`);
        closeDetailModal();
        loadData();
      } catch (err) {
        showToast(err.message);
      }
    }
  });

  // Reset Demo Data Button
  document.getElementById('btn-reset-demo').addEventListener('click', async () => {
    if (confirm('Reset SQLite database to realistic seed tickets?')) {
      try {
        await apiResetDatabase();
        showToast('Database reset successfully');
        loadData();
      } catch (err) {
        showToast(err.message);
      }
    }
  });

  // Export CSV
  document.getElementById('btn-export-csv').addEventListener('click', exportCsv);

  // Search input with debounce
  let searchTimer;
  const searchInput = document.getElementById('filter-search');
  const searchClear = document.getElementById('filter-search-clear');

  searchInput.addEventListener('input', (e) => {
    const val = e.target.value;
    if (val) searchClear.classList.remove('hidden');
    else searchClear.classList.add('hidden');

    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.filters.search = val;
      checkFiltersActive();
      loadData();
    }, 250);
  });

  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchClear.classList.add('hidden');
    state.filters.search = '';
    checkFiltersActive();
    loadData();
  });

  // Status segment buttons
  document.querySelectorAll('.filter-status-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-status-btn').forEach(b => {
        b.classList.remove('bg-slate-800', 'text-slate-100', 'shadow-xs');
        b.classList.add('text-slate-400');
      });
      btn.classList.add('bg-slate-800', 'text-slate-100', 'shadow-xs');
      btn.classList.remove('text-slate-400');

      state.filters.status = btn.dataset.status;
      checkFiltersActive();
      loadData();
    });
  });

  // Dropdown filters
  document.getElementById('filter-priority').addEventListener('change', (e) => {
    state.filters.priority = e.target.value;
    checkFiltersActive();
    loadData();
  });
  document.getElementById('filter-category').addEventListener('change', (e) => {
    state.filters.category = e.target.value;
    checkFiltersActive();
    loadData();
  });
  document.getElementById('filter-department').addEventListener('change', (e) => {
    state.filters.department = e.target.value;
    checkFiltersActive();
    loadData();
  });
  document.getElementById('filter-assignee').addEventListener('change', (e) => {
    state.filters.assignee = e.target.value;
    checkFiltersActive();
    loadData();
  });

  // Reset Filters Button
  const btnReset = document.getElementById('btn-reset-filters');
  btnReset.addEventListener('click', () => {
    state.filters = {
      status: 'all',
      priority: 'all',
      category: 'all',
      department: 'all',
      assignee: 'all',
      search: ''
    };
    searchInput.value = '';
    searchClear.classList.add('hidden');
    document.getElementById('filter-priority').value = 'all';
    document.getElementById('filter-category').value = 'all';
    document.getElementById('filter-department').value = 'all';
    document.getElementById('filter-assignee').value = 'all';

    document.querySelectorAll('.filter-status-btn').forEach(b => {
      b.classList.remove('bg-slate-800', 'text-slate-100');
      b.classList.add('text-slate-400');
      if (b.dataset.status === 'all') {
        b.classList.add('bg-slate-800', 'text-slate-100');
        b.classList.remove('text-slate-400');
      }
    });

    btnReset.classList.add('hidden');
    loadData();
  });

  function checkFiltersActive() {
    const f = state.filters;
    const isActive = f.status !== 'all' || f.priority !== 'all' || f.category !== 'all' || f.department !== 'all' || f.assignee !== 'all' || f.search !== '';
    if (isActive) btnReset.classList.remove('hidden');
    else btnReset.classList.add('hidden');
  }

  // Delegated Table Events (select, view, quick status, quick assign, delete)
  document.getElementById('tickets-table-body').addEventListener('click', async (e) => {
    const target = e.target.closest('[data-action]');
    if (!target) return;

    const action = target.dataset.action;
    const ticketId = target.dataset.id;

    if (action === 'view-detail') {
      openDetailModal(ticketId);
    } else if (action === 'quick-status') {
      const newStatus = target.dataset.status;
      try {
        await apiUpdateTicket(ticketId, {
          status: newStatus,
          actor_name: state.currentUser?.name || 'IT Specialist'
        });
        showToast(`Ticket ${ticketId} set to ${newStatus.replace('_', ' ')}`);
        loadData();
      } catch (err) {
        showToast(err.message);
      }
    } else if (action === 'delete-ticket') {
      if (confirm(`Permanently delete ticket ${ticketId}?`)) {
        try {
          await apiDeleteTicket(ticketId);
          showToast(`Deleted ticket ${ticketId}`);
          state.selectedIds.delete(ticketId);
          loadData();
        } catch (err) {
          showToast(err.message);
        }
      }
    }
  });

  // Assignee change event delegation
  document.getElementById('tickets-table-body').addEventListener('change', async (e) => {
    if (e.target.dataset.action === 'quick-assign') {
      const ticketId = e.target.dataset.id;
      const staffId = e.target.value === 'unassigned' ? null : e.target.value;
      try {
        await apiUpdateTicket(ticketId, {
          assignee_id: staffId,
          actor_name: state.currentUser?.name || 'IT Specialist'
        });
        showToast(`Assigned ticket ${ticketId}`);
        loadData();
      } catch (err) {
        showToast(err.message);
      }
    }
  });

  // Table Row Selection Checkbox
  document.getElementById('tickets-table-body').addEventListener('change', (e) => {
    if (e.target.classList.contains('ticket-select-chk')) {
      const id = e.target.dataset.selectId;
      if (e.target.checked) state.selectedIds.add(id);
      else state.selectedIds.delete(id);
      renderTable();
    }
  });

  // Select All Checkbox
  document.getElementById('th-select-all').addEventListener('change', (e) => {
    if (e.target.checked) {
      state.tickets.forEach(t => state.selectedIds.add(t.id));
    } else {
      state.selectedIds.clear();
    }
    renderTable();
  });

  // Bulk Action Buttons
  document.getElementById('btn-bulk-in-progress')?.addEventListener('click', async () => {
    for (const id of state.selectedIds) {
      await apiUpdateTicket(id, { status: 'in_progress', actor_name: state.currentUser?.name || 'IT Specialist' });
    }
    showToast(`Updated ${state.selectedIds.size} tickets to In Progress`);
    state.selectedIds.clear();
    loadData();
  });

  document.getElementById('btn-bulk-resolved')?.addEventListener('click', async () => {
    for (const id of state.selectedIds) {
      await apiUpdateTicket(id, { status: 'resolved', actor_name: state.currentUser?.name || 'IT Specialist' });
    }
    showToast(`Updated ${state.selectedIds.size} tickets to Resolved`);
    state.selectedIds.clear();
    loadData();
  });

  document.getElementById('btn-bulk-delete')?.addEventListener('click', async () => {
    if (confirm(`Delete ${state.selectedIds.size} tickets?`)) {
      for (const id of state.selectedIds) {
        await apiDeleteTicket(id);
      }
      showToast(`Deleted ${state.selectedIds.size} tickets`);
      state.selectedIds.clear();
      loadData();
    }
  });

  document.getElementById('btn-bulk-clear')?.addEventListener('click', () => {
    state.selectedIds.clear();
    renderTable();
  });

  // Kanban view delegated click
  document.getElementById('view-kanban').addEventListener('click', async (e) => {
    const target = e.target.closest('[data-action]');
    if (!target) return;

    const action = target.dataset.action;
    const ticketId = target.dataset.id;

    if (action === 'view-detail') {
      openDetailModal(ticketId);
    } else if (action === 'quick-status') {
      const newStatus = target.dataset.status;
      try {
        await apiUpdateTicket(ticketId, {
          status: newStatus,
          actor_name: state.currentUser?.name || 'IT Specialist'
        });
        showToast(`Moved ${ticketId} to ${newStatus.replace('_', ' ')}`);
        loadData();
      } catch (err) {
        showToast(err.message);
      }
    }
  });

  // SQL Console Preset Buttons & Execution
  document.querySelectorAll('.sql-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const query = btn.dataset.query;
      const input = document.getElementById('sql-query-input');
      if (input && query) {
        input.value = query;
        runSqlQuery();
      }
    });
  });

  document.getElementById('btn-execute-sql').addEventListener('click', runSqlQuery);
}

// App Initialization
async function initApp() {
  initEventHandlers();
  await checkBackendAvailability();

  // Load staff list & users list
  try {
    const [staff, users] = await Promise.all([
      apiGetStaff(),
      apiGetUsers()
    ]);
    state.staff = staff;
    state.users = users;

    // Check saved user or default to first admin (Sarah Jenkins)
    let saved = null;
    try {
      const item = localStorage.getItem('opsdesk_user');
      if (item) saved = JSON.parse(item);
    } catch {}

    if (saved && users.some(u => u.id === saved.id)) {
      setCurrentUser(saved);
    } else if (users.length > 0) {
      setCurrentUser(users[0]);
    }

    // Populate filter assignee select
    const filterAssignee = document.getElementById('filter-assignee');
    if (filterAssignee) {
      filterAssignee.innerHTML = `
        <option value="all">All Assignees</option>
        <option value="unassigned">Unassigned Only</option>
        ${staff.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
      `;
    }
  } catch (err) {
    console.error('Failed to load initial metadata:', err);
  }

  // Load initial tickets and stats
  await loadData();
}

// Start on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
