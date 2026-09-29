# IT Support Ticket Management System

An enterprise IT Support Ticket Management System designed to streamline technical support requests, prioritize workflows, track SLAs, and log ticket status changes.

---

## ⚡ Quick Start: Run in VS Code with "Live Server" (1-Click)

The application includes an **in-browser SQLite data engine and embedded SQL processor**, meaning you can run it directly with VS Code's **Live Server** extension without needing any terminal commands or server installations!

### Steps:
1. **Open the Project in VS Code**:
   - Launch VS Code and open this folder (`File > Open Folder...`).
2. **Install Live Server Extension** (if not already installed):
   - In VS Code, click the Extensions icon (`Ctrl+Shift+X` or `Cmd+Shift+X`).
   - Search for **"Live Server"** by *Ritwick Dey* and click **Install**.
3. **Run Live Server**:
   - Right-click on **`index.html`** in the VS Code File Explorer.
   - Select **"Open with Live Server"** (or click **"Go Live"** on the blue status bar at the bottom right).
4. **View Output**:
   - Your default browser will instantly open at:
     ```
     http://127.0.0.1:5500/index.html
     ```
   - Notice the green badge: **"VS Code Live Server (SQL Active)"** in the top navigation!
   - You can immediately:
     - Log in as **Guest**, **Admin** (Sarah Jenkins, Marcus Chen, Elena Rostova), or **Company Employees** (David Miller, Sophia Patel, Rachel Kim, Carlos Mendez).
     - Submit technical tickets across Network, Hardware, Software, Security, and IAM.
     - 1-click update ticket statuses (`Open` → `In Progress` → `Resolved` → `Closed`).
     - Drag and drop / view cards on the Kanban board.
     - View SLA compliance timers and countdowns.
     - Execute live relational SQL queries (`SELECT * FROM tickets;`) in the **SQL Console**!
     - All changes persist automatically to browser storage.

---

## 🛠️ Technology Stacks & Permitted Languages

The codebase is organized strictly using:
- **HTML**: `index.html` (Intake portal, admin dashboard, login modal, kanban board, high-density queue table)
- **CSS**: `style.css` & `src/index.css` (Tailwind & standalone custom CSS styling, typography, status badges)
- **C**: `backend/server.c` & `backend/Makefile` (POSIX C socket HTTP server communicating with SQLite database via `sqlite3.h`)
- **Java**: `backend/TicketServer.java` (Java HTTP server using `com.sun.net.httpserver.HttpServer` and SQLite SQL)
- **SQL**: `backend/schema.sql` (Relational SQL database tables and seed data for `users`, `tickets`, and `ticket_activities`)

---

## 🖥️ Alternative Ways to Run in VS Code

### Option A: Run with C Backend (C + SQLite + HTML + CSS)
```bash
cd backend
make                # Or: gcc -Wall -O2 server.c -lsqlite3 -o ticket_server
./ticket_server
```
Open `http://localhost:8080`.

### Option B: Run with Java Backend (Java + SQLite + HTML + CSS)
```bash
cd backend
javac TicketServer.java
java TicketServer
```
Open `http://localhost:8080`.

### Option C: Run with Node Dev Server
```bash
npm install
npm run dev
```
Open `http://localhost:3000`.

---

## 👥 Built-In Roles & Accounts

### 1. **IT Admin Specialists**
- Full administrative control: 1-click status transitions, reassigning specialists, adding work notes, and running SQL queries.
- **Accounts**:
  - `Sarah Jenkins` (`sarah.jenkins@company.internal`) — Senior Systems Engineer
  - `Marcus Chen` (`marcus.chen@company.internal`) — Lead Network Engineer
  - `Elena Rostova` (`elena.rostova@company.internal`) — Security & Identity Lead

### 2. **Company Employees (Standard Users)**
- Submits tickets with automatic auto-fill for Department, Submitter Name, and Submitter Email.
- Can filter the view to **"My Tickets"** to track resolution progress and SLA timers.
- **Accounts**:
  - `David Miller` (`david.miller@company.internal`) — Engineering
  - `Sophia Patel` (`sophia.patel@company.internal`) — Data & Analytics
  - `Rachel Kim` (`rachel.kim@company.internal`) — Product Design
  - `Carlos Mendez` (`carlos.mendez@company.internal`) — Sales & Growth
  - *Or click "Sign In / Create Employee Profile" to log in with any custom company email.*

### 3. **Guest / Contractor**
- Instant 1-click guest access for visitors, contractors, or external staff.

---

## 🗄️ Relational SQL Schema (`backend/schema.sql`)

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'user', 'guest')),
  department TEXT NOT NULL,
  title TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE tickets (
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
  resolution_notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sla_due_at TEXT NOT NULL
);

CREATE TABLE ticket_activities (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  action_type TEXT NOT NULL,
  comment TEXT,
  created_at TEXT NOT NULL
);
```
