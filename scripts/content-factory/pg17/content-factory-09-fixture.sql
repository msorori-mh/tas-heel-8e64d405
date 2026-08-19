CREATE TABLE public.grades(id uuid PRIMARY KEY, slug text NOT NULL);
CREATE TABLE public.curriculum_tracks(id uuid PRIMARY KEY, track_code text NOT NULL, is_active boolean NOT NULL DEFAULT true);
CREATE TABLE public.subjects(id uuid PRIMARY KEY, code text NOT NULL, grade_id uuid NOT NULL REFERENCES public.grades(id));
CREATE TABLE public.subject_curriculum_tracks(subject_id uuid NOT NULL REFERENCES public.subjects(id), curriculum_track_id uuid NOT NULL REFERENCES public.curriculum_tracks(id), is_active boolean NOT NULL DEFAULT true, PRIMARY KEY(subject_id,curriculum_track_id));
CREATE TABLE public.units(id uuid PRIMARY KEY, code text NOT NULL, subject_id uuid NOT NULL REFERENCES public.subjects(id));
CREATE TABLE public.lessons(id uuid PRIMARY KEY, slug text NOT NULL, subject_id uuid NOT NULL REFERENCES public.subjects(id), unit_id uuid REFERENCES public.units(id));

INSERT INTO public.grades VALUES ('40000000-0000-0000-0000-000000000001','GRADE-10');
INSERT INTO public.curriculum_tracks VALUES ('41000000-0000-0000-0000-000000000001','sanaa',true);
INSERT INTO public.subjects VALUES ('42000000-0000-0000-0000-000000000001','QURAN-G10','40000000-0000-0000-0000-000000000001');
INSERT INTO public.subject_curriculum_tracks VALUES ('42000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000001',true);
INSERT INTO public.lessons VALUES ('43000000-0000-0000-0000-000000000001','quran-lesson','42000000-0000-0000-0000-000000000001',NULL);
