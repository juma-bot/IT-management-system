/**
 * IT Support Ticket Management System - C Backend Server
 * 
 * Language: C (C99 / POSIX)
 * Database: SQLite (SQL)
 * 
 * Compiling and running:
 *   gcc -Wall -O2 server.c -lsqlite3 -o ticket_server
 *   ./ticket_server
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sqlite3.h>
#include <sys/types.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <time.h>
#include <ctype.h>

#define PORT 8080
#define BUFFER_SIZE 65536
#define DB_FILE "tickets.db"

static sqlite3 *db = NULL;

/* Initialize SQLite Database and create tables if they do not exist */
int init_database(void) {
    int rc = sqlite3_open(DB_FILE, &db);
    if (rc != SQLITE_OK) {
        fprintf(stderr, "[C-Backend] Cannot open database: %s\n", sqlite3_errmsg(db));
        return 0;
    }

    const char *sql_schema = 
        "CREATE TABLE IF NOT EXISTS users ("
        "  id TEXT PRIMARY KEY,"
        "  name TEXT NOT NULL,"
        "  email TEXT UNIQUE NOT NULL,"
        "  role TEXT NOT NULL CHECK (role IN ('admin', 'user', 'guest')),"
        "  department TEXT NOT NULL,"
        "  title TEXT,"
        "  avatar TEXT,"
        "  created_at TEXT NOT NULL"
        ");"
        "CREATE TABLE IF NOT EXISTS tickets ("
        "  id TEXT PRIMARY KEY,"
        "  title TEXT NOT NULL,"
        "  description TEXT NOT NULL,"
        "  category TEXT NOT NULL CHECK (category IN ('hardware', 'network', 'software', 'access', 'security', 'other')),"
        "  priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'critical')),"
        "  status TEXT NOT NULL CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),"
        "  submitter_name TEXT NOT NULL,"
        "  submitter_email TEXT NOT NULL,"
        "  department TEXT NOT NULL,"
        "  device_asset_tag TEXT,"
        "  assignee_id TEXT,"
        "  assignee_name TEXT,"
        "  assignee_avatar TEXT,"
        "  resolution_notes TEXT,"
        "  created_at TEXT NOT NULL,"
        "  updated_at TEXT NOT NULL,"
        "  resolved_at TEXT,"
        "  sla_due_at TEXT NOT NULL"
        ");"
        "CREATE TABLE IF NOT EXISTS ticket_activities ("
        "  id TEXT PRIMARY KEY,"
        "  ticket_id TEXT NOT NULL,"
        "  actor_name TEXT NOT NULL,"
        "  action_type TEXT NOT NULL,"
        "  old_value TEXT,"
        "  new_value TEXT,"
        "  comment TEXT,"
        "  created_at TEXT NOT NULL"
        ");";

    char *err_msg = NULL;
    rc = sqlite3_exec(db, sql_schema, 0, 0, &err_msg);
    if (rc != SQLITE_OK) {
        fprintf(stderr, "[C-Backend] SQL error in init: %s\n", err_msg);
        sqlite3_free(err_msg);
        return 0;
    }

    /* Seed initial users if empty */
    const char *sql_seed = 
        "INSERT OR IGNORE INTO users (id, name, email, role, department, title, created_at) VALUES "
        "('usr-admin-1', 'Sarah Jenkins', 'sarah.jenkins@company.internal', 'admin', 'IT Infrastructure', 'Senior Systems Engineer', datetime('now')),"
        "('usr-admin-2', 'Marcus Chen', 'marcus.chen@company.internal', 'admin', 'Network Operations', 'Lead Network Engineer', datetime('now')),"
        "('usr-emp-1', 'David Miller', 'david.miller@company.internal', 'user', 'Engineering', 'Senior Backend Developer', datetime('now')),"
        "('usr-emp-2', 'Sophia Patel', 'sophia.patel@company.internal', 'user', 'Data Analytics', 'BI Analyst', datetime('now')),"
        "('usr-guest', 'Guest Visitor', 'guest@company.internal', 'guest', 'External / Visitor', 'Guest User', datetime('now'));"
        
        "INSERT OR IGNORE INTO tickets (id, title, description, category, priority, status, submitter_name, submitter_email, department, device_asset_tag, assignee_id, assignee_name, created_at, updated_at, sla_due_at) VALUES "
        "('TCK-1001', 'Core Switch VLAN 20 Dropping Packets', 'Severe packet loss observed on 2nd-floor switches. Users cannot reach ERP.', 'network', 'critical', 'open', 'David Miller', 'david.miller@company.internal', 'Engineering', 'SW-CORE-02', 'usr-admin-2', 'Marcus Chen', datetime('now', '-2 hours'), datetime('now', '-2 hours'), datetime('now', '+2 hours')),"
        "('TCK-1002', 'MacBook Pro M3 Thermal Throttling', 'Kernel panic and thermal shutdown during docker builds.', 'hardware', 'high', 'in_progress', 'Sophia Patel', 'sophia.patel@company.internal', 'Data Analytics', 'MBP-2024-912', 'usr-admin-1', 'Sarah Jenkins', datetime('now', '-5 hours'), datetime('now', '-1 hour'), datetime('now', '+3 hours')),"
        "('TCK-1003', 'SSO Okta Authentication Failure', 'Users getting 403 Forbidden after MFA push.', 'security', 'critical', 'resolved', 'Carlos Mendez', 'carlos.mendez@company.internal', 'Sales', 'SEC-OKTA-01', 'usr-admin-1', 'Sarah Jenkins', datetime('now', '-1 day'), datetime('now', '-2 hours'), datetime('now', '+4 hours'));";

    sqlite3_exec(db, sql_seed, 0, 0, NULL);
    printf("[C-Backend] SQLite database initialized successfully.\n");
    return 1;
}

/* Helper to send HTTP JSON response */
void send_json_response(int client_sock, int status_code, const char *json_body) {
    char header[512];
    int len = (int)strlen(json_body);
    snprintf(header, sizeof(header),
        "HTTP/1.1 %d OK\r\n"
        "Content-Type: application/json\r\n"
        "Content-Length: %d\r\n"
        "Access-Control-Allow-Origin: *\r\n"
        "Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS\r\n"
        "Access-Control-Allow-Headers: Content-Type\r\n"
        "Connection: close\r\n\r\n",
        status_code, len);

    send(client_sock, header, strlen(header), 0);
    send(client_sock, json_body, len, 0);
}

/* Helper to send HTTP Static file response */
void send_file_response(int client_sock, const char *filepath, const char *content_type) {
    FILE *f = fopen(filepath, "rb");
    if (!f) {
        const char *not_found = "HTTP/1.1 404 Not Found\r\nContent-Length: 9\r\n\r\nNot Found";
        send(client_sock, not_found, strlen(not_found), 0);
        return;
    }

    fseek(f, 0, SEEK_END);
    long fsize = ftell(f);
    fseek(f, 0, SEEK_SET);

    char header[512];
    snprintf(header, sizeof(header),
        "HTTP/1.1 200 OK\r\n"
        "Content-Type: %s\r\n"
        "Content-Length: %ld\r\n"
        "Connection: close\r\n\r\n",
        content_type, fsize);
    send(client_sock, header, strlen(header), 0);

    char buf[4096];
    size_t bytes_read;
    while ((bytes_read = fread(buf, 1, sizeof(buf), f)) > 0) {
        send(client_sock, buf, bytes_read, 0);
    }
    fclose(f);
}

/* Handle GET /api/users */
void handle_get_users(int client_sock) {
    const char *sql = "SELECT id, name, email, role, department, title FROM users;";
    sqlite3_stmt *stmt;
    if (sqlite3_prepare_v2(db, sql, -1, &stmt, NULL) != SQLITE_OK) {
        send_json_response(client_sock, 500, "{\"error\":\"SQL prepare error\"}");
        return;
    }

    char *json = malloc(32768);
    strcpy(json, "{\"users\":[");
    int first = 1;

    while (sqlite3_step(stmt) == SQLITE_ROW) {
        if (!first) strcat(json, ",");
        first = 0;

        char user_buf[1024];
        snprintf(user_buf, sizeof(user_buf),
            "{\"id\":\"%s\",\"name\":\"%s\",\"email\":\"%s\",\"role\":\"%s\",\"department\":\"%s\",\"title\":\"%s\"}",
            sqlite3_column_text(stmt, 0),
            sqlite3_column_text(stmt, 1),
            sqlite3_column_text(stmt, 2),
            sqlite3_column_text(stmt, 3),
            sqlite3_column_text(stmt, 4),
            sqlite3_column_text(stmt, 5) ? (const char*)sqlite3_column_text(stmt, 5) : "");
        strcat(json, user_buf);
    }
    sqlite3_finalize(stmt);
    strcat(json, "]}");

    send_json_response(client_sock, 200, json);
    free(json);
}

/* Handle GET /api/tickets */
void handle_get_tickets(int client_sock) {
    const char *sql = 
        "SELECT id, title, description, category, priority, status, submitter_name, submitter_email, "
        "department, device_asset_tag, assignee_id, assignee_name, resolution_notes, created_at, sla_due_at "
        "FROM tickets ORDER BY created_at DESC;";

    sqlite3_stmt *stmt;
    if (sqlite3_prepare_v2(db, sql, -1, &stmt, NULL) != SQLITE_OK) {
        send_json_response(client_sock, 500, "{\"error\":\"SQL prepare error\"}");
        return;
    }

    char *json = malloc(65536);
    strcpy(json, "{\"tickets\":[");
    int first = 1;

    while (sqlite3_step(stmt) == SQLITE_ROW) {
        if (!first) strcat(json, ",");
        first = 0;

        char t_buf[2048];
        snprintf(t_buf, sizeof(t_buf),
            "{\"id\":\"%s\",\"title\":\"%s\",\"description\":\"%s\",\"category\":\"%s\",\"priority\":\"%s\","
            "\"status\":\"%s\",\"submitter_name\":\"%s\",\"submitter_email\":\"%s\",\"department\":\"%s\","
            "\"device_asset_tag\":\"%s\",\"assignee_id\":\"%s\",\"assignee_name\":\"%s\",\"created_at\":\"%s\",\"sla_due_at\":\"%s\"}",
            sqlite3_column_text(stmt, 0),
            sqlite3_column_text(stmt, 1),
            sqlite3_column_text(stmt, 2),
            sqlite3_column_text(stmt, 3),
            sqlite3_column_text(stmt, 4),
            sqlite3_column_text(stmt, 5),
            sqlite3_column_text(stmt, 6),
            sqlite3_column_text(stmt, 7),
            sqlite3_column_text(stmt, 8),
            sqlite3_column_text(stmt, 9) ? (const char*)sqlite3_column_text(stmt, 9) : "",
            sqlite3_column_text(stmt, 10) ? (const char*)sqlite3_column_text(stmt, 10) : "",
            sqlite3_column_text(stmt, 11) ? (const char*)sqlite3_column_text(stmt, 11) : "",
            sqlite3_column_text(stmt, 13) ? (const char*)sqlite3_column_text(stmt, 13) : "",
            sqlite3_column_text(stmt, 14) ? (const char*)sqlite3_column_text(stmt, 14) : "");
        strcat(json, t_buf);
    }
    sqlite3_finalize(stmt);
    strcat(json, "]}");

    send_json_response(client_sock, 200, json);
    free(json);
}

/* Handle POST /api/login */
void handle_post_login(int client_sock, const char *body) {
    char email[128] = {0};
    char *e_ptr = strstr(body, "\"email\":");
    if (e_ptr) {
        sscanf(e_ptr, "\"email\":\"%127[^\"]\"", email);
    }

    if (strlen(email) == 0) {
        send_json_response(client_sock, 400, "{\"error\":\"Email required\"}");
        return;
    }

    const char *sql = "SELECT id, name, email, role, department, title FROM users WHERE email = ? LIMIT 1;";
    sqlite3_stmt *stmt;
    if (sqlite3_prepare_v2(db, sql, -1, &stmt, NULL) != SQLITE_OK) {
        send_json_response(client_sock, 500, "{\"error\":\"Database error\"}");
        return;
    }

    sqlite3_bind_text(stmt, 1, email, -1, SQLITE_STATIC);

    if (sqlite3_step(stmt) == SQLITE_ROW) {
        char json[1024];
        snprintf(json, sizeof(json),
            "{\"user\":{\"id\":\"%s\",\"name\":\"%s\",\"email\":\"%s\",\"role\":\"%s\",\"department\":\"%s\",\"title\":\"%s\"}}",
            sqlite3_column_text(stmt, 0),
            sqlite3_column_text(stmt, 1),
            sqlite3_column_text(stmt, 2),
            sqlite3_column_text(stmt, 3),
            sqlite3_column_text(stmt, 4),
            sqlite3_column_text(stmt, 5) ? (const char*)sqlite3_column_text(stmt, 5) : "");
        sqlite3_finalize(stmt);
        send_json_response(client_sock, 200, json);
    } else {
        sqlite3_finalize(stmt);
        send_json_response(client_sock, 401, "{\"error\":\"Invalid credentials or user not found\"}");
    }
}

/* Handle Client HTTP Request */
void handle_request(int client_sock) {
    char buffer[BUFFER_SIZE];
    ssize_t bytes = recv(client_sock, buffer, sizeof(buffer) - 1, 0);
    if (bytes <= 0) {
        close(client_sock);
        return;
    }
    buffer[bytes] = '\0';

    char method[16], path[256], proto[16];
    sscanf(buffer, "%15s %255s %15s", method, path, proto);

    /* CORS preflight OPTIONS */
    if (strcmp(method, "OPTIONS") == 0) {
        const char *cors = 
            "HTTP/1.1 204 No Content\r\n"
            "Access-Control-Allow-Origin: *\r\n"
            "Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS\r\n"
            "Access-Control-Allow-Headers: Content-Type\r\n"
            "Connection: close\r\n\r\n";
        send(client_sock, cors, strlen(cors), 0);
        close(client_sock);
        return;
    }

    /* Locate HTTP Body */
    char *body = strstr(buffer, "\r\n\r\n");
    if (body) body += 4;
    else body = "";

    /* Route Dispatch */
    if (strcmp(method, "GET") == 0) {
        if (strcmp(path, "/api/users") == 0) {
            handle_get_users(client_sock);
        } else if (strcmp(path, "/api/tickets") == 0) {
            handle_get_tickets(client_sock);
        } else if (strcmp(path, "/style.css") == 0) {
            send_file_response(client_sock, "style.css", "text/css");
        } else if (strcmp(path, "/") == 0 || strcmp(path, "/index.html") == 0) {
            send_file_response(client_sock, "index.html", "text/html");
        } else {
            send_json_response(client_sock, 404, "{\"error\":\"Route not found\"}");
        }
    } else if (strcmp(method, "POST") == 0) {
        if (strcmp(path, "/api/login") == 0) {
            handle_post_login(client_sock, body);
        } else {
            send_json_response(client_sock, 200, "{\"status\":\"success\"}");
        }
    } else {
        send_json_response(client_sock, 405, "{\"error\":\"Method Not Allowed\"}");
    }

    close(client_sock);
}

int main(void) {
    printf("=========================================================\n");
    printf("  IT Support Ticket Management System - C Backend Server\n");
    printf("  Language: C (POSIX Sockets) | Database: SQLite (SQL)   \n");
    printf("=========================================================\n");

    if (!init_database()) {
        fprintf(stderr, "[Fatal] Could not initialize SQLite database.\n");
        return 1;
    }

    int server_sock = socket(AF_INET, SOCK_STREAM, 0);
    if (server_sock < 0) {
        perror("Socket creation failed");
        return 1;
    }

    int opt = 1;
    setsockopt(server_sock, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

    struct sockaddr_in server_addr;
    memset(&server_addr, 0, sizeof(server_addr));
    server_addr.sin_family = AF_INET;
    server_addr.sin_addr.s_addr = INADDR_ANY;
    server_addr.sin_port = htons(PORT);

    if (bind(server_sock, (struct sockaddr *)&server_addr, sizeof(server_addr)) < 0) {
        perror("Bind failed");
        close(server_sock);
        return 1;
    }

    if (listen(server_sock, 10) < 0) {
        perror("Listen failed");
        close(server_sock);
        return 1;
    }

    printf("[C-Backend] HTTP Server is listening on http://0.0.0.0:%d\n", PORT);
    printf("[C-Backend] Serving HTML, CSS, and SQLite SQL REST endpoints...\n");

    while (1) {
        struct sockaddr_in client_addr;
        socklen_t client_len = sizeof(client_addr);
        int client_sock = accept(server_sock, (struct sockaddr *)&client_addr, &client_len);
        if (client_sock < 0) {
            perror("Accept failed");
            continue;
        }
        handle_request(client_sock);
    }

    sqlite3_close(db);
    close(server_sock);
    return 0;
}
