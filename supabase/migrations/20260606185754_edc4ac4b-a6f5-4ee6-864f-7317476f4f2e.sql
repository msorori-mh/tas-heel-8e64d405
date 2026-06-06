INSERT INTO public.grades (slug, name, category, sort_order) VALUES
  ('grade-12-scientific', 'الثاني عشر — علمي', 'scientific', 1),
  ('grade-12-literary', 'الثاني عشر — أدبي', 'literary', 2)
ON CONFLICT (slug) DO NOTHING;