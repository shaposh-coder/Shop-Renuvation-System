-- Convert existing plain-text passwords to SHA-256 hash
create extension if not exists pgcrypto;

update public.users
set user_password = encode(digest(user_password, 'sha256'), 'hex')
where user_password is not null
  and user_password !~ '^[0-9a-f]{64}$';
