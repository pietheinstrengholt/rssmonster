// Creates the complete default configuration used by the Smart Folder editor.
export function createEmptySmartFolderConfig() {
    return {
        name: '',
        limitCount: 50,
        status: {
            unread: false,
            read: false,
            favorite: false,
            clicked: false,
            hot: false
        },
        date: {
            preset: '',
            useRelative: false,
            relativeAmount: 7,
            relativeUnit: 'd'
        },
        content: {
            tags: '',
            title: '',
            author: '',
            text: '',
            language: ''
        },
        scores: {
            quality: 0,
            freshness: 0
        },
        events: {
            isEvent: false,
            isNotEvent: false,
            useMinimumCount: false,
            minimumCount: 2
        },
        sort: {
            field: ''
        }
    };
}

// Splits a stored query while preserving the editor's supported quoted field values.
export function tokenizeSmartFolderQuery(query) {
    return String(query || '').match(/(?:[A-Za-z]+:)?"[^"]*"|\S+/g) || [];
}

// Restores a query value for display in an editor field.
export function stripSmartFolderQuotes(value) {
    return String(value || '').replace(/^"|"$/g, '').replace(/\\"/g, '"');
}

// Quotes generated values only when their whitespace requires it.
export function quoteSmartFolderValue(value) {
    return /\s/.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value;
}

// Reduces tag input to the single tag supported by the existing editor.
export function normalizeSmartFolderTag(value) {
    return String(value || '')
        .split(/[,\s]+/)
        .filter(Boolean)[0] || '';
}

// Reads the numeric threshold suffix used by score filters.
export function parseSmartFolderScoreToken(token) {
    const match = token.match(/(\d+\.?\d*|\.\d+)$/);
    return match ? Number(match[1]) : 0;
}

// Applies a relative first-seen token to an editor configuration.
function applyFirstSeenToken(config, token) {
    const match = token.match(/^firstSeen:(\d+)([hd])$/i);
    if (!match) return;

    config.date.useRelative = true;
    config.date.relativeAmount = Number(match[1]);
    config.date.relativeUnit = match[2].toLowerCase();
}

// Keeps only the first supported tag when a query contains tag filters.
function appendDraftTag(config, tag) {
    if (config.content.tags) return;
    config.content.tags = normalizeSmartFolderTag(tag);
}

// Applies an event-count token while preserving the editor's fallback minimum.
function applyEventCountToken(config, token) {
    const match = token.match(/(\d+)$/);
    config.events.useMinimumCount = true;
    config.events.minimumCount = match ? Number(match[1]) : 2;
}

// Maps stored sort aliases onto the editor's select values.
function applySortToken(config, token) {
    const sortValue = token.split(':')[1];

    if (['trust', 'recommended', 'quality', 'attention'].includes(sortValue)) {
        config.sort.field = sortValue;
        return;
    }

    if (sortValue === 'desc') config.sort.field = 'published-desc';
    if (sortValue === 'asc') config.sort.field = 'published-asc';
}

// Parses supported filters and preserves unrecognized tokens as the editor's free text.
export function parseSmartFolderQuery(query, initialConfig = createEmptySmartFolderConfig()) {
    const config = initialConfig;
    const freeText = [];

    tokenizeSmartFolderQuery(query).forEach(token => {
        const cleaned = token.replace(/[.,;]+$/, '');
        const lower = cleaned.toLowerCase();

        if (lower === 'unread:true') {
            config.status.unread = true;
            config.status.read = false;
        } else if (lower === 'read:true') {
            config.status.read = true;
            config.status.unread = false;
        } else if (lower === 'favorite:true' || lower === 'star:true') config.status.favorite = true;
        else if (lower === 'clicked:true') config.status.clicked = true;
        else if (lower === 'hot:true') config.status.hot = true;
        else if (['@today', '@yesterday', '@lastweek'].includes(lower)) config.date.preset = lower;
        else if (/^firstseen:\d+[hd]$/i.test(cleaned)) applyFirstSeenToken(config, cleaned);
        else if (/^tag:/i.test(cleaned)) appendDraftTag(config, stripSmartFolderQuotes(cleaned.slice(cleaned.indexOf(':') + 1)));
        else if (/^title:/i.test(cleaned)) config.content.title = stripSmartFolderQuotes(cleaned.slice(cleaned.indexOf(':') + 1));
        else if (/^author:/i.test(cleaned)) config.content.author = stripSmartFolderQuotes(cleaned.slice(cleaned.indexOf(':') + 1));
        else if (/^language:/i.test(cleaned)) config.content.language = cleaned.slice(cleaned.indexOf(':') + 1);
        else if (/^quality:/i.test(cleaned)) config.scores.quality = parseSmartFolderScoreToken(cleaned);
        else if (/^freshness:/i.test(cleaned)) config.scores.freshness = parseSmartFolderScoreToken(cleaned);
        else if (lower === 'event:true') config.events.isEvent = true;
        else if (lower === 'event:false') config.events.isNotEvent = true;
        else if (/^eventcount:/i.test(cleaned)) applyEventCountToken(config, cleaned);
        else if (/^sort:/i.test(cleaned)) applySortToken(config, cleaned);
        else if (/^limit:/i.test(cleaned)) config.limitCount = Number(cleaned.split(':')[1]) || 50;
        else freeText.push(stripSmartFolderQuotes(cleaned));
    });

    config.content.text = freeText.join(' ');
    return config;
}

// Generates the persisted query using the editor's established token order and aliases.
export function buildSmartFolderQuery(config) {
    const parts = [];

    if (config.status.unread) parts.push('unread:true');
    if (config.status.read) parts.push('read:true');
    if (config.status.favorite) parts.push('favorite:true');
    if (config.status.clicked) parts.push('clicked:true');
    if (config.status.hot) parts.push('hot:true');

    if (config.date.useRelative && config.date.relativeAmount) {
        parts.push(`firstSeen:${config.date.relativeAmount}${config.date.relativeUnit}`);
    } else if (config.date.preset === '@last7days') {
        parts.push('firstSeen:7d');
    } else if (config.date.preset === '@last30days') {
        parts.push('firstSeen:30d');
    } else if (config.date.preset) {
        parts.push(config.date.preset);
    }

    if (config.content.tags.trim()) {
        parts.push(`tag:${normalizeSmartFolderTag(config.content.tags)}`);
    }

    if (config.content.title) parts.push(`title:${quoteSmartFolderValue(config.content.title)}`);
    if (config.content.author) parts.push(`author:${quoteSmartFolderValue(config.content.author)}`);
    if (config.content.language) parts.push(`language:${config.content.language}`);
    if (config.content.text) parts.push(quoteSmartFolderValue(config.content.text));

    if (config.scores.quality > 0) parts.push(`quality:>=${Number(config.scores.quality).toFixed(2)}`);
    if (config.scores.freshness > 0) parts.push(`freshness:>=${Number(config.scores.freshness).toFixed(2)}`);

    if (config.events.isEvent) parts.push('event:true');
    if (config.events.isNotEvent) parts.push('event:false');
    if (config.events.useMinimumCount) parts.push(`eventCount:>=${config.events.minimumCount}`);

    if (config.sort.field === 'published-desc') {
        parts.push('sort:desc');
    } else if (config.sort.field === 'published-asc') {
        parts.push('sort:asc');
    } else if (config.sort.field) {
        parts.push(`sort:${config.sort.field}`);
    }

    parts.push(`limit:${config.limitCount}`);
    return parts.join(' ');
}
