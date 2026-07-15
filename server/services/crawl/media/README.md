Purpose

Extracts structured media and selects article images.

# Expected responsibilities:

## Process media
parse Media RSS fields;
parse enclosures;
recognize supported provider embeds;
resolve relative media URLs;
return normalized structured media;
use a known provider registry;
return unknown providers as null or an explicitly supported unknown value;
distinguish video, audio, image, iframe, and gallery candidates.

## Detect Article Image
collect image candidates from feed fields, HTML, media, and metadata;
resolve image URLs;
inspect responsive candidates;
preserve candidate evidence such as source, dimensions, position, class, ID, and alt text.

## Select Lead Image
deduplicate candidates;
merge candidate metadata;
reject structurally decorative images;
score dimensions, aspect ratio, source quality, article position, and URL evidence;
treat natural-language alt text as soft evidence rather than unconditional rejection;
return one normalized lead-image object or null.

# Media modules should not:

persist article rows;
perform user-wide duplicate matching;
apply action rules;
call OpenAI;
modify article read state;
perform semantic clustering;
write hotlinks;
decide whether an article is filtered;
fetch or verify remote images synchronously unless that becomes an explicit separate enrichment service.

Media extraction should produce structured candidates, not control persistence