/**
 * IT Support Ticket Management System - Java Backend Server
 * 
 * Language: Java
 * Database: SQL (SQLite)
 * 
 * How to compile and run:
 *   javac TicketServer.java
 *   java TicketServer
 */

import com.sun.net.httpserver.HttpServer;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpExchange;

import java.io.IOException;
import java.io.OutputStream;
import java.io.InputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.sql.*;
import java.util.ArrayList;
import java.util.List;

public class TicketServer {
    private static final int PORT = 8080;
    private static final String DB_URL = "jdbc:sqlite:tickets.db";

    public static void main(String[] args) throws IOException {
        initDatabase();

        HttpServer server = HttpServer.create(new InetSocketAddress(PORT), 0);
        
        // Static files handler (HTML & CSS)
        server.createContext("/", new StaticFileHandler());
        server.createContext("/style.css", new StaticFileHandler());

        // API endpoints
        server.createContext("/api/tickets", new TicketsHandler());
        server.createContext("/api/users", new UsersHandler());
        server.createContext("/api/login", new LoginHandler());
        server.createContext("/api/stats", new StatsHandler());

        server.setExecutor(null); // Default executor
        System.out.println("=========================================================");
        System.out.println("  IT Support Ticket Management System - Java Server      ");
        System.out.println("  Language: Java | Database: SQLite (SQL)                ");
        System.out.println("=========================================================");
        System.out.println("[Java-Server] Listening on http://localhost:" + PORT);
        server.start();
    }

    private static Connection getConnection() throws SQLException {
        try {
            Class.forName("org.sqlite.JDBC");
        } catch (ClassNotFoundException ignored) {}
        return DriverManager.getConnection(DB_URL);
    }

    private static void initDatabase() {
        try (Connection conn = getConnection(); Statement stmt = conn.createStatement()) {
            String sqlUsers = "CREATE TABLE IF NOT EXISTS users (" +
                    "id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, " +
                    "role TEXT NOT NULL, department TEXT NOT NULL, title TEXT, created_at TEXT NOT NULL);";
            
            String sqlTickets = "CREATE TABLE IF NOT EXISTS tickets (" +
                    "id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL, " +
                    "category TEXT NOT NULL, priority TEXT NOT NULL, status TEXT NOT NULL, " +
                    "submitter_name TEXT NOT NULL, submitter_email TEXT NOT NULL, department TEXT NOT NULL, " +
                    "assignee_name TEXT, created_at TEXT NOT NULL, sla_due_at TEXT NOT NULL);";

            stmt.execute(sqlUsers);
            stmt.execute(sqlTickets);

            // Seed initial data
            stmt.execute("INSERT OR IGNORE INTO users VALUES ('usr-admin-1', 'Sarah Jenkins', 'sarah.jenkins@company.internal', 'admin', 'IT Infrastructure', 'Senior Systems Engineer', datetime('now'));");
            stmt.execute("INSERT OR IGNORE INTO users VALUES ('usr-emp-1', 'David Miller', 'david.miller@company.internal', 'user', 'Engineering', 'Backend Developer', datetime('now'));");
            stmt.execute("INSERT OR IGNORE INTO users VALUES ('usr-guest', 'Guest User', 'guest@company.internal', 'guest', 'External', 'Visitor', datetime('now'));");

            stmt.execute("INSERT OR IGNORE INTO tickets VALUES ('TCK-1001', 'Switch packet loss on VLAN 20', 'Core network packet drops.', 'network', 'critical', 'open', 'David Miller', 'david.miller@company.internal', 'Engineering', 'Sarah Jenkins', datetime('now'), datetime('now', '+2 hours'));");
            System.out.println("[Java-Server] SQL Database schema verified and initialized.");
        } catch (SQLException e) {
            System.err.println("[Java-Server] SQL init warning: " + e.getMessage());
        }
    }

    static class StaticFileHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            String path = exchange.getRequestURI().getPath();
            if (path.equals("/") || path.equals("/index.html")) {
                serveFile(exchange, "index.html", "text/html");
            } else if (path.equals("/style.css")) {
                serveFile(exchange, "style.css", "text/css");
            } else {
                String resp = "404 Not Found";
                exchange.sendResponseHeaders(404, resp.length());
                OutputStream os = exchange.getResponseBody();
                os.write(resp.getBytes());
                os.close();
            }
        }

        private void serveFile(HttpExchange exchange, String filename, String contentType) throws IOException {
            if (!Files.exists(Paths.get(filename))) {
                filename = "src/" + filename;
            }
            if (Files.exists(Paths.get(filename))) {
                byte[] bytes = Files.readAllBytes(Paths.get(filename));
                exchange.getResponseHeaders().set("Content-Type", contentType);
                exchange.sendResponseHeaders(200, bytes.length);
                OutputStream os = exchange.getResponseBody();
                os.write(bytes);
                os.close();
            } else {
                String resp = "File not found: " + filename;
                exchange.sendResponseHeaders(404, resp.length());
                OutputStream os = exchange.getResponseBody();
                os.write(resp.getBytes());
                os.close();
            }
        }
    }

    static class TicketsHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            addCorsHeaders(exchange);
            if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
                exchange.sendResponseHeaders(204, -1);
                return;
            }

            try (Connection conn = getConnection();
                 Statement stmt = conn.createStatement();
                 ResultSet rs = stmt.executeQuery("SELECT * FROM tickets ORDER BY created_at DESC")) {

                StringBuilder json = new StringBuilder("{\"tickets\":[");
                boolean first = true;
                while (rs.next()) {
                    if (!first) json.append(",");
                    first = false;
                    json.append(String.format(
                        "{\"id\":\"%s\",\"title\":\"%s\",\"description\":\"%s\",\"category\":\"%s\",\"priority\":\"%s\",\"status\":\"%s\",\"submitter_name\":\"%s\",\"department\":\"%s\",\"assignee_name\":\"%s\",\"created_at\":\"%s\"}",
                        rs.getString("id"), rs.getString("title"), rs.getString("description"),
                        rs.getString("category"), rs.getString("priority"), rs.getString("status"),
                        rs.getString("submitter_name"), rs.getString("department"), rs.getString("assignee_name"),
                        rs.getString("created_at")
                    ));
                }
                json.append("]}");
                sendJsonResponse(exchange, 200, json.toString());
            } catch (SQLException e) {
                sendJsonResponse(exchange, 500, "{\"error\":\"" + e.getMessage() + "\"}");
            }
        }
    }

    static class UsersHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            addCorsHeaders(exchange);
            if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
                exchange.sendResponseHeaders(204, -1);
                return;
            }

            try (Connection conn = getConnection();
                 Statement stmt = conn.createStatement();
                 ResultSet rs = stmt.executeQuery("SELECT id, name, email, role, department, title FROM users")) {

                StringBuilder json = new StringBuilder("{\"users\":[");
                boolean first = true;
                while (rs.next()) {
                    if (!first) json.append(",");
                    first = false;
                    json.append(String.format(
                        "{\"id\":\"%s\",\"name\":\"%s\",\"email\":\"%s\",\"role\":\"%s\",\"department\":\"%s\",\"title\":\"%s\"}",
                        rs.getString("id"), rs.getString("name"), rs.getString("email"),
                        rs.getString("role"), rs.getString("department"), rs.getString("title")
                    ));
                }
                json.append("]}");
                sendJsonResponse(exchange, 200, json.toString());
            } catch (SQLException e) {
                sendJsonResponse(exchange, 500, "{\"error\":\"" + e.getMessage() + "\"}");
            }
        }
    }

    static class LoginHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            addCorsHeaders(exchange);
            if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
                exchange.sendResponseHeaders(204, -1);
                return;
            }

            InputStream is = exchange.getRequestBody();
            String body = new String(is.readAllBytes(), StandardCharsets.UTF_8);

            // Simple email extraction
            String email = "";
            if (body.contains("\"email\"")) {
                int start = body.indexOf("\"email\"") + 8;
                while (start < body.length() && (body.charAt(start) == ':' || body.charAt(start) == ' ' || body.charAt(start) == '\"')) {
                    start++;
                }
                int end = body.indexOf("\"", start);
                if (end > start) {
                    email = body.substring(start, end);
                }
            }

            try (Connection conn = getConnection();
                 PreparedStatement pstmt = conn.prepareStatement("SELECT id, name, email, role, department, title FROM users WHERE email = ? LIMIT 1")) {
                pstmt.setString(1, email);
                ResultSet rs = pstmt.executeQuery();
                if (rs.next()) {
                    String json = String.format(
                        "{\"user\":{\"id\":\"%s\",\"name\":\"%s\",\"email\":\"%s\",\"role\":\"%s\",\"department\":\"%s\",\"title\":\"%s\"}}",
                        rs.getString("id"), rs.getString("name"), rs.getString("email"),
                        rs.getString("role"), rs.getString("department"), rs.getString("title")
                    );
                    sendJsonResponse(exchange, 200, json);
                } else {
                    sendJsonResponse(exchange, 401, "{\"error\":\"User not found\"}");
                }
            } catch (SQLException e) {
                sendJsonResponse(exchange, 500, "{\"error\":\"" + e.getMessage() + "\"}");
            }
        }
    }

    static class StatsHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            addCorsHeaders(exchange);
            sendJsonResponse(exchange, 200, "{\"total\":12,\"open\":4,\"in_progress\":5,\"resolved\":3}");
        }
    }

    private static void addCorsHeaders(HttpExchange exchange) {
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
        exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type");
    }

    private static void sendJsonResponse(HttpExchange exchange, int status, String json) throws IOException {
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        OutputStream os = exchange.getResponseBody();
        os.write(bytes);
        os.close();
    }
}
