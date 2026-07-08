INSERT INTO user (id, name, first_name, last_name, email, email_verified, must_change_password, created_at, updated_at)
VALUES ('11ce16aa-1910-4552-84b5-1e19d66e1340', 'Analytics Datashake', 'Analytics', 'Datashake', 'analytics@datashake.fr', 1, 0, 1783499314, 1783499314);

INSERT INTO account (id, user_id, account_id, provider_id, password, created_at, updated_at)
VALUES ('8edf2e1e-40ba-4311-bc9b-6d11bf1990bf', '11ce16aa-1910-4552-84b5-1e19d66e1340', 'analytics@datashake.fr', 'credential', '9ba8a0fde86fa95279789d74d15edb24:298b378a01aee8983236f19460eb1b303eaafbc821c97f376876659649c7cbda1443ed7fb11d5618f88f2aad867401d51d346d2965158950498fcfabce4406ee', 1783499314, 1783499314);
