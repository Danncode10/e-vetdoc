-- More services owners can book: Deworming, Grooming, and Others (describe it in the reason).
-- Safe to run twice: existing slugs are left untouched.
INSERT INTO public.services (
    name, slug, description, short_desc, category,
    price_from, price_to, price_label, duration_minutes,
    is_featured, is_published, display_order, icon
)
VALUES
    (
        'Deworming',
        'deworming',
        'Deworming treatment. The clinic will confirm the right product and dose for your pet''s weight and age.',
        'Parasite prevention',
        'Preventive Care',
        NULL, NULL, NULL, NULL,
        true, true, 30, 'pill'
    ),
    (
        'Grooming',
        'grooming',
        'Grooming visit: bath, nail trim, ear cleaning and coat care.',
        'Bath, nails and coat care',
        'Grooming',
        NULL, NULL, NULL, NULL,
        true, true, 40, 'scissors'
    ),
    (
        'Others',
        'others',
        'Any other concern. Describe what your pet needs in the reason for visit.',
        'Describe your concern',
        'Other',
        NULL, NULL, NULL, NULL,
        false, true, 90, 'ellipsis'
    )
ON CONFLICT (slug) DO NOTHING;
