-- Run once in Supabase -> SQL Editor. Points these teams at the cropped
-- photos that ship with the app. "upload" keeps ESPN syncs from replacing them.
update members set logo_url = '/team-logos/tony.webp',    logo_source = 'upload', logo_error = null where name = 'Tony';
update members set logo_url = '/team-logos/reed.webp',    logo_source = 'upload', logo_error = null where name = 'Reed';
update members set logo_url = '/team-logos/morelli.webp', logo_source = 'upload', logo_error = null where name = 'Morelli';
update members set logo_url = '/team-logos/jack.webp',    logo_source = 'upload', logo_error = null where name = 'Jack';
update members set logo_url = '/team-logos/cal.webp',     logo_source = 'upload', logo_error = null where name = 'Cal';
update members set logo_url = '/team-logos/bigmike.webp', logo_source = 'upload', logo_error = null where name = 'Big Mike';
update members set logo_url = '/team-logos/murray.webp',  logo_source = 'upload', logo_error = null where name = 'Murray';
