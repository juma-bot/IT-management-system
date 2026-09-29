# Makefile for IT Support Ticket Management System (C Backend)
# Requires: gcc, libsqlite3-dev

CC = gcc
CFLAGS = -Wall -Wextra -O2
LIBS = -lsqlite3

TARGET = ticket_server
SRCS = server.c

all: $(TARGET)

$(TARGET): $(SRCS)
	$(CC) $(CFLAGS) $(SRCS) -o $(TARGET) $(LIBS)

run: $(TARGET)
	./$(TARGET)

clean:
	rm -f $(TARGET) tickets.db
