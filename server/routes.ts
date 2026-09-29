import { Router, Request, Response } from 'express';
import { getDb, queryAll, queryOne, runQuery, persistDb, Ticket, TicketActivity, IT_STAFF, User, seedUsers } from './db.js';

export const apiRouter = Router();

// SLA hours lookup based on priority
const SLA_HOURS: Record<string, number> = {
  critical: 4,
  high: 12,
  medium: 24,
  low: 48
};

// GET /api/users - List all system users (admins, employees, guests)
apiRouter.get('/users', async (_req: Request, res: Response) => {
  try {
    const db = await getDb();
    const users = queryAll<User>(db, 'SELECT * FROM users ORDER BY role ASC, name ASC');
    res.json({ users });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch users' });
  }
});

// POST /api/auth/login - Log in as Admin, Company User, or Guest
apiRouter.post('/auth/login', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const { email, userId, role } = req.body;

    let user: User | null = null;
    if (userId) {
      user = queryOne<User>(db, 'SELECT * FROM users WHERE id = ?', [userId]);
    } else if (email) {
      user = queryOne<User>(db, 'SELECT * FROM users WHERE LOWER(email) = ?', [email.toLowerCase().trim()]);
    } else if (role === 'guest') {
      user = queryOne<User>(db, 'SELECT * FROM users WHERE role = "guest" LIMIT 1');
    }

    if (!user) {
      return res.status(404).json({ error: 'User account not found' });
    }

    res.json({ success: true, user });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Login failed' });
  }
});

// POST /api/auth/register - Register a new company employee or user
apiRouter.post('/auth/register', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const { name, email, department, role = 'user', title = '' } = req.body;

    if (!name || !email || !department) {
      return res.status(400).json({ error: 'Name, email, and department are required' });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const existing = queryOne<User>(db, 'SELECT * FROM users WHERE LOWER(email) = ?', [trimmedEmail]);
    if (existing) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    const newId = `usr-${Date.now().toString(36)}`;
    const nowIso = new Date().toISOString();

    runQuery(
      db,
      `INSERT INTO users (id, name, email, role, department, title, avatar, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [newId, name.trim(), trimmedEmail, role, department.trim(), title.trim() || null, null, nowIso]
    );

    const created = queryOne<User>(db, 'SELECT * FROM users WHERE id = ?', [newId]);
    res.status(201).json({ success: true, user: created });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Registration failed' });
  }
});

// GET /api/staff - List available IT support specialists
apiRouter.get('/staff', (_req: Request, res: Response) => {
  res.json({ staff: IT_STAFF });
});

// GET /api/stats - Dashboard analytics
apiRouter.get('/stats', async (_req: Request, res: Response) => {
  try {
    const db = await getDb();
    const tickets = queryAll<Ticket>(db, 'SELECT * FROM tickets ORDER BY created_at DESC');

    const total = tickets.length;
    const open = tickets.filter(t => t.status === 'open').length;
    const inProgress = tickets.filter(t => t.status === 'in_progress').length;
    const resolved = tickets.filter(t => t.status === 'resolved').length;
    const closed = tickets.filter(t => t.status === 'closed').length;
    const critical = tickets.filter(t => t.priority === 'critical' && t.status !== 'resolved' && t.status !== 'closed').length;

    // SLA analysis
    const now = new Date();
    const slaBreached = tickets.filter(t => {
      if (t.status === 'resolved' || t.status === 'closed') return false;
      return new Date(t.sla_due_at) < now;
    }).length;

    const slaAtRisk = tickets.filter(t => {
      if (t.status === 'resolved' || t.status === 'closed') return false;
      const due = new Date(t.sla_due_at);
      const diffHours = (due.getTime() - now.getTime()) / (1000 * 3600);
      return diffHours >= 0 && diffHours <= 4;
    }).length;

    // Category breakdown
    const categoryCounts: Record<string, number> = {};
    for (const t of tickets) {
      categoryCounts[t.category] = (categoryCounts[t.category] || 0) + 1;
    }

    // Priority breakdown
    const priorityCounts: Record<string, number> = {};
    for (const t of tickets) {
      priorityCounts[t.priority] = (priorityCounts[t.priority] || 0) + 1;
    }

    // Recent 10 activities across all tickets
    const recentActivities = queryAll<TicketActivity>(
      db,
      'SELECT * FROM ticket_activities ORDER BY created_at DESC LIMIT 10'
    );

    res.json({
      total,
      open,
      inProgress,
      resolved,
      closed,
      active: open + inProgress,
      critical,
      slaBreached,
      slaAtRisk,
      categoryCounts,
      priorityCounts,
      recentActivities
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch dashboard stats' });
  }
});

// GET /api/tickets - List & filter tickets
apiRouter.get('/tickets', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const { status, priority, category, department, assignee, search, submitter_email } = req.query;

    let sql = 'SELECT * FROM tickets WHERE 1=1';
    const params: any[] = [];

    if (submitter_email && typeof submitter_email === 'string' && submitter_email !== 'all') {
      sql += ' AND LOWER(submitter_email) = ?';
      params.push(submitter_email.toLowerCase().trim());
    }
    if (status && status !== 'all') {
      sql += ' AND status = ?';
      params.push(status);
    }
    if (priority && priority !== 'all') {
      sql += ' AND priority = ?';
      params.push(priority);
    }
    if (category && category !== 'all') {
      sql += ' AND category = ?';
      params.push(category);
    }
    if (department && department !== 'all') {
      sql += ' AND department = ?';
      params.push(department);
    }
    if (assignee && assignee !== 'all') {
      if (assignee === 'unassigned') {
        sql += ' AND (assignee_id IS NULL OR assignee_id = "")';
      } else {
        sql += ' AND assignee_id = ?';
        params.push(assignee);
      }
    }

    if (search && typeof search === 'string' && search.trim() !== '') {
      const term = `%${search.trim().toLowerCase()}%`;
      sql += ' AND (LOWER(title) LIKE ? OR LOWER(description) LIKE ? OR LOWER(id) LIKE ? OR LOWER(submitter_name) LIKE ? OR LOWER(device_asset_tag) LIKE ?)';
      params.push(term, term, term, term, term);
    }

    sql += ' ORDER BY created_at DESC';

    const tickets = queryAll<Ticket>(db, sql, params);
    res.json({ tickets });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch tickets' });
  }
});

// GET /api/tickets/:id - Single ticket details with activities
apiRouter.get('/tickets/:id', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const ticket = queryOne<Ticket>(db, 'SELECT * FROM tickets WHERE id = ?', [req.params.id]);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const activities = queryAll<TicketActivity>(
      db,
      'SELECT * FROM ticket_activities WHERE ticket_id = ? ORDER BY created_at ASC',
      [ticket.id]
    );

    res.json({ ticket, activities });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch ticket details' });
  }
});

// POST /api/tickets - Create ticket (Standardize reporting)
apiRouter.post('/tickets', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const {
      title,
      description,
      category,
      priority = 'medium',
      submitter_name,
      submitter_email,
      department,
      device_asset_tag
    } = req.body;

    if (!title || !description || !category || !submitter_name || !submitter_email || !department) {
      return res.status(400).json({
        error: 'Missing required fields: title, description, category, submitter_name, submitter_email, department'
      });
    }

    // Generate ticket ID: TCK-10XX
    const existing = queryAll<Ticket>(db, 'SELECT id FROM tickets');
    let maxNum = 1007;
    for (const t of existing) {
      const match = t.id.match(/^TCK-(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }
    const nextId = `TCK-${maxNum + 1}`;

    const now = new Date();
    const nowIso = now.toISOString();
    const slaHours = SLA_HOURS[priority] || 24;
    const slaDue = new Date(now.getTime() + slaHours * 3600 * 1000).toISOString();

    // Auto-assign suggestion based on category specialty
    let defaultAssignee = null;
    if (category === 'network') {
      defaultAssignee = IT_STAFF.find(s => s.id === 'staff-2') || null;
    } else if (category === 'security' || category === 'access') {
      defaultAssignee = IT_STAFF.find(s => s.id === 'staff-3') || null;
    } else if (category === 'software') {
      defaultAssignee = IT_STAFF.find(s => s.id === 'staff-1') || null;
    } else if (category === 'hardware') {
      defaultAssignee = IT_STAFF.find(s => s.id === 'staff-4') || null;
    }

    runQuery(
      db,
      `INSERT INTO tickets (id, title, description, category, priority, status, submitter_name, submitter_email, department, device_asset_tag, assignee_id, assignee_name, assignee_avatar, resolution_notes, created_at, updated_at, resolved_at, sla_due_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nextId,
        title.trim(),
        description.trim(),
        category,
        priority,
        'open',
        submitter_name.trim(),
        submitter_email.trim(),
        department.trim(),
        device_asset_tag ? device_asset_tag.trim() : null,
        defaultAssignee ? defaultAssignee.id : null,
        defaultAssignee ? defaultAssignee.name : null,
        defaultAssignee ? defaultAssignee.avatar : null,
        null,
        nowIso,
        nowIso,
        null,
        slaDue
      ]
    );

    // Initial activity log
    runQuery(
      db,
      `INSERT INTO ticket_activities (id, ticket_id, actor_name, action_type, old_value, new_value, comment, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `ACT-${Math.random().toString(36).substring(2, 9)}`,
        nextId,
        submitter_name.trim(),
        'created',
        null,
        'open',
        `Ticket created with priority ${priority.toUpperCase()} (${slaHours}h SLA window).`,
        nowIso
      ]
    );

    if (defaultAssignee) {
      runQuery(
        db,
        `INSERT INTO ticket_activities (id, ticket_id, actor_name, action_type, old_value, new_value, comment, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          `ACT-${Math.random().toString(36).substring(2, 9)}`,
          nextId,
          'System Auto-Router',
          'reassigned',
          'Unassigned',
          defaultAssignee.name,
          `Automatically assigned to ${defaultAssignee.name} (${defaultAssignee.role}) based on ${category} category routing rules.`,
          nowIso
        ]
      );
    }

    const created = queryOne<Ticket>(db, 'SELECT * FROM tickets WHERE id = ?', [nextId]);
    res.status(201).json({ ticket: created });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create ticket' });
  }
});

// PATCH /api/tickets/:id - Update ticket (Status, Priority, Assignee, Notes, etc.)
apiRouter.patch('/tickets/:id', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const ticketId = req.params.id;
    const existing = queryOne<Ticket>(db, 'SELECT * FROM tickets WHERE id = ?', [ticketId]);

    if (!existing) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const {
      status,
      priority,
      category,
      assignee_id,
      resolution_notes,
      title,
      description,
      actor_name = 'IT Staff'
    } = req.body;

    const nowIso = new Date().toISOString();
    let updatedStatus = existing.status;
    let updatedPriority = existing.priority;
    let updatedCategory = existing.category;
    let updatedAssigneeId = existing.assignee_id;
    let updatedAssigneeName = existing.assignee_name;
    let updatedAssigneeAvatar = existing.assignee_avatar;
    let updatedResolutionNotes = existing.resolution_notes;
    let updatedResolvedAt = existing.resolved_at;
    let updatedTitle = existing.title;
    let updatedDescription = existing.description;
    let updatedSlaDue = existing.sla_due_at;

    // Handle status change
    if (status && status !== existing.status) {
      updatedStatus = status;
      if (status === 'resolved' || status === 'closed') {
        updatedResolvedAt = nowIso;
      } else {
        updatedResolvedAt = null;
      }

      runQuery(
        db,
        `INSERT INTO ticket_activities (id, ticket_id, actor_name, action_type, old_value, new_value, comment, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          `ACT-${Math.random().toString(36).substring(2, 9)}`,
          ticketId,
          actor_name,
          'status_changed',
          existing.status,
          status,
          `Status changed from ${existing.status.replace('_', ' ')} to ${status.replace('_', ' ')}`,
          nowIso
        ]
      );
    }

    // Handle priority change
    if (priority && priority !== existing.priority) {
      updatedPriority = priority;
      const slaHours = SLA_HOURS[priority] || 24;
      updatedSlaDue = new Date(new Date(existing.created_at).getTime() + slaHours * 3600 * 1000).toISOString();

      runQuery(
        db,
        `INSERT INTO ticket_activities (id, ticket_id, actor_name, action_type, old_value, new_value, comment, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          `ACT-${Math.random().toString(36).substring(2, 9)}`,
          ticketId,
          actor_name,
          'priority_changed',
          existing.priority,
          priority,
          `Priority updated from ${existing.priority} to ${priority} (${slaHours}h target window)`,
          nowIso
        ]
      );
    }

    // Handle category change
    if (category && category !== existing.category) {
      updatedCategory = category;
    }

    // Handle assignee change
    if (assignee_id !== undefined && assignee_id !== existing.assignee_id) {
      if (!assignee_id || assignee_id === 'unassigned') {
        updatedAssigneeId = null;
        updatedAssigneeName = null;
        updatedAssigneeAvatar = null;
        runQuery(
          db,
          `INSERT INTO ticket_activities (id, ticket_id, actor_name, action_type, old_value, new_value, comment, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            `ACT-${Math.random().toString(36).substring(2, 9)}`,
            ticketId,
            actor_name,
            'reassigned',
            existing.assignee_name || 'Unassigned',
            'Unassigned',
            'Ticket unassigned',
            nowIso
          ]
        );
      } else {
        const staff = IT_STAFF.find(s => s.id === assignee_id);
        if (staff) {
          updatedAssigneeId = staff.id;
          updatedAssigneeName = staff.name;
          updatedAssigneeAvatar = staff.avatar;
          runQuery(
            db,
            `INSERT INTO ticket_activities (id, ticket_id, actor_name, action_type, old_value, new_value, comment, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              `ACT-${Math.random().toString(36).substring(2, 9)}`,
              ticketId,
              actor_name,
              'reassigned',
              existing.assignee_name || 'Unassigned',
              staff.name,
              `Reassigned ticket to ${staff.name}`,
              nowIso
            ]
          );
        }
      }
    }

    // Handle resolution notes
    if (resolution_notes !== undefined && resolution_notes !== existing.resolution_notes) {
      updatedResolutionNotes = resolution_notes;
      if (resolution_notes && resolution_notes.trim()) {
        runQuery(
          db,
          `INSERT INTO ticket_activities (id, ticket_id, actor_name, action_type, old_value, new_value, comment, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            `ACT-${Math.random().toString(36).substring(2, 9)}`,
            ticketId,
            actor_name,
            'note_added',
            null,
            null,
            resolution_notes.trim(),
            nowIso
          ]
        );
      }
    }

    if (title && title.trim()) updatedTitle = title.trim();
    if (description && description.trim()) updatedDescription = description.trim();

    runQuery(
      db,
      `UPDATE tickets SET
        title = ?,
        description = ?,
        category = ?,
        priority = ?,
        status = ?,
        assignee_id = ?,
        assignee_name = ?,
        assignee_avatar = ?,
        resolution_notes = ?,
        updated_at = ?,
        resolved_at = ?,
        sla_due_at = ?
       WHERE id = ?`,
      [
        updatedTitle,
        updatedDescription,
        updatedCategory,
        updatedPriority,
        updatedStatus,
        updatedAssigneeId,
        updatedAssigneeName,
        updatedAssigneeAvatar,
        updatedResolutionNotes,
        nowIso,
        updatedResolvedAt,
        updatedSlaDue,
        ticketId
      ]
    );

    const updated = queryOne<Ticket>(db, 'SELECT * FROM tickets WHERE id = ?', [ticketId]);
    const activities = queryAll<TicketActivity>(
      db,
      'SELECT * FROM ticket_activities WHERE ticket_id = ? ORDER BY created_at ASC',
      [ticketId]
    );

    res.json({ ticket: updated, activities });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update ticket' });
  }
});

// POST /tickets/:id/notes - Add note / activity entry
apiRouter.post('/tickets/:id/notes', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const ticketId = req.params.id;
    const { comment, actor_name = 'IT Specialist' } = req.body;

    if (!comment || !comment.trim()) {
      return res.status(400).json({ error: 'Comment text is required' });
    }

    const ticket = queryOne<Ticket>(db, 'SELECT * FROM tickets WHERE id = ?', [ticketId]);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const nowIso = new Date().toISOString();
    runQuery(
      db,
      `INSERT INTO ticket_activities (id, ticket_id, actor_name, action_type, old_value, new_value, comment, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `ACT-${Math.random().toString(36).substring(2, 9)}`,
        ticketId,
        actor_name,
        'note_added',
        null,
        null,
        comment.trim(),
        nowIso
      ]
    );

    runQuery(db, 'UPDATE tickets SET updated_at = ? WHERE id = ?', [nowIso, ticketId]);

    const activities = queryAll<TicketActivity>(
      db,
      'SELECT * FROM ticket_activities WHERE ticket_id = ? ORDER BY created_at ASC',
      [ticketId]
    );

    res.json({ success: true, activities });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to add note' });
  }
});

// POST /api/sql - Execute raw SQL query against SQLite database
apiRouter.post('/sql', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const { query } = req.body;
    if (!query || typeof query !== 'string' || !query.trim()) {
      return res.status(400).json({ error: 'SQL query string required' });
    }

    const trimmed = query.trim();
    const results = db.exec(trimmed);
    persistDb(db);

    res.json({
      success: true,
      query: trimmed,
      results: results.map(r => ({
        columns: r.columns,
        values: r.values
      }))
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'SQL execution failed' });
  }
});

// DELETE /api/tickets/:id - Full CRUD Delete support
apiRouter.delete('/tickets/:id', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const ticketId = req.params.id;
    const ticket = queryOne<Ticket>(db, 'SELECT * FROM tickets WHERE id = ?', [ticketId]);

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    runQuery(db, 'DELETE FROM ticket_activities WHERE ticket_id = ?', [ticketId]);
    runQuery(db, 'DELETE FROM tickets WHERE id = ?', [ticketId]);

    res.json({ success: true, deletedId: ticketId });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete ticket' });
  }
});

// POST /api/seed/reset - Reset to realistic initial dataset
apiRouter.post('/seed/reset', async (_req: Request, res: Response) => {
  try {
    const db = await getDb();
    runQuery(db, 'DELETE FROM ticket_activities');
    runQuery(db, 'DELETE FROM tickets');

    // Re-seed
    const countResult = db.exec('SELECT COUNT(*) as count FROM tickets');
    // Calling getDb logic will re-seed
    res.json({ success: true, message: 'Database reset successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to reset seed' });
  }
});
