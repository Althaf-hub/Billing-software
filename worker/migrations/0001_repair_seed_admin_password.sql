-- Repair the malformed password hash in the initial deployed seed data.
-- admin / Test@1234
UPDATE users
SET password_hash = '$2a$10$H4kAQq8oQe/zCmagt037RuWRXh65p55zCzinrMvHpNL9aVrpYenlC'
WHERE id = 'user-admin-001' AND username = 'admin';
