#!/usr/bin/env python3
import sys
import json
import sqlite3
import os
import time

DB_PATH = os.environ.get('KANBAN_DB', os.path.join(os.path.expanduser('~'), '.hermes', 'kanban.db'))

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute('''CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        body TEXT,
        assignee TEXT,
        status TEXT NOT NULL,
        priority INTEGER DEFAULT 0,
        created_by TEXT,
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        completed_at INTEGER,
        workspace_kind TEXT DEFAULT 'scratch',
        goal_mode INTEGER DEFAULT 0,
        consecutive_failures INTEGER DEFAULT 0,
        block_recurrences INTEGER DEFAULT 0
    )''')
    conn.commit()
    conn.close()

def list_tasks():
    init_db()
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute('SELECT id, title, body, assignee, status, priority, created_at, completed_at FROM tasks ORDER BY priority DESC, created_at DESC')
    rows = cur.fetchall()
    tasks = []
    for r in rows:
        tasks.append({
            'id': r[0],
            'title': r[1],
            'body': r[2] or '',
            'assignee': r[3] or 'default',
            'status': r[4] or 'backlog',
            'priority': r[5] or 0,
            'createdAt': r[6],
            'completedAt': r[7]
        })
    conn.close()
    return tasks

def add_task(title, body='', assignee='default', status='backlog', priority=0):
    init_db()
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    task_id = 'task-' + hex(int(time.time() * 1000))[2:]
    created_at = int(time.time())
    cur.execute('''INSERT OR REPLACE INTO tasks (id, title, body, assignee, status, priority, created_at, workspace_kind, goal_mode, consecutive_failures, block_recurrences)
                   VALUES (?, ?, ?, ?, ?, ?, ?, 'scratch', 0, 0, 0)''',
                (task_id, title, body, assignee, status, int(priority), created_at))
    conn.commit()
    conn.close()
    return {'id': task_id, 'title': title, 'body': body, 'assignee': assignee, 'status': status, 'priority': priority, 'createdAt': created_at}

def update_task(task_id, data):
    init_db()
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    
    fields = []
    params = []
    if 'title' in data:
        fields.append('title = ?')
        params.append(data['title'])
    if 'body' in data:
        fields.append('body = ?')
        params.append(data['body'])
    if 'assignee' in data:
        fields.append('assignee = ?')
        params.append(data['assignee'])
    if 'status' in data:
        fields.append('status = ?')
        params.append(data['status'])
        if data['status'] == 'done':
            fields.append('completed_at = ?')
            params.append(int(time.time()))
    if 'priority' in data:
        fields.append('priority = ?')
        params.append(int(data['priority']))

    if fields:
        params.append(task_id)
        query = f"UPDATE tasks SET {', '.join(fields)} WHERE id = ?"
        cur.execute(query, params)
        conn.commit()
    conn.close()
    return True

def delete_task(task_id):
    init_db()
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
    conn.commit()
    conn.close()
    return True

if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'list'
    if cmd == 'list':
        print(json.dumps(list_tasks()))
    elif cmd == 'add':
        data = json.loads(sys.argv[2])
        print(json.dumps(add_task(data.get('title', ''), data.get('body', ''), data.get('assignee', 'default'), data.get('status', 'backlog'), data.get('priority', 0))))
    elif cmd == 'update':
        task_id = sys.argv[2]
        data = json.loads(sys.argv[3])
        print(json.dumps(update_task(task_id, data)))
    elif cmd == 'delete':
        task_id = sys.argv[2]
        print(json.dumps(delete_task(task_id)))
