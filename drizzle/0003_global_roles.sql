ALTER TABLE users RENAME COLUMN role TO global_role;
ALTER TABLE users ADD COLUMN password_algorithm TEXT NOT NULL DEFAULT 'pbkdf2-sha256';
ALTER TABLE users ADD COLUMN password_iterations INTEGER NOT NULL DEFAULT 100000;

DELETE FROM tenant_memberships
WHERE tenant_id = 'tenant_norrmobler'
  AND role = 'tenant_admin'
  AND user_id IN (SELECT id FROM users WHERE global_role = 'admin');

UPDATE tenant_memberships SET role = 'admin' WHERE role = 'tenant_admin';
