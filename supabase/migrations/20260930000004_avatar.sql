-- VeyrArc · profile photo (onboarding «Добавить фото», Account): a small JPEG data URL (≈10 KB)
alter table public.profiles add column avatar_url text check (char_length(avatar_url) <= 120000);
