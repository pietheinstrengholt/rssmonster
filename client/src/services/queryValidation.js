/**
 * Query Validation Service
 * Shared validation logic for search queries and smart folder expressions.
 */

/**
 * Known expression patterns for search/filter queries.
 * Each pattern validates a specific filter type.
 */
export const expressionPatterns = [
    { name: 'star', regex: /^star:(true|false)$/i },
    { name: 'unread', regex: /^unread:(true|false)$/i },
    { name: 'read', regex: /^read:(true|false)$/i },
    { name: 'clicked', regex: /^clicked:(true|false)$/i },
    { name: 'cluster', regex: /^cluster:(true|false)$/i },
    { name: 'hot', regex: /^hot:(true|false)$/i },
    { name: 'tag', regex: /^tag:(.+)$/i },
    { name: 'title', regex: /^title:(.+)$/i },
    { name: 'sort', regex: /^sort:(DESC|ASC|IMPORTANCE|QUALITY)$/i },    { name: 'limit', regex: /^limit:\s*(\d+)$/i },    { name: 'quality', regex: /^quality:(<=|>=|<|>|=)?\s*(\d+\.?\d*|\.\d+)$/i },
    { name: 'freshness', regex: /^freshness:(<=|>=|<|>|=)?\s*(\d+\.?\d*|\.\d+)$/i },
    { name: 'dateSpecific', regex: /^@(\d{4}-\d{2}-\d{2})$/ },
    { name: 'today', regex: /^@today$/i },
    { name: 'yesterday', regex: /^@yesterday$/i },
    { name: 'daysAgo', regex: /^@"?(\d+)\s+days\s+ago"?$/i },
    { name: 'lastDay', regex: /^@"?last\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)"?$/i }
];

/**
 * Known keywords for filter expressions.
 */
export const knownKeywords = ['star', 'unread', 'read', 'clicked', 'cluster', 'hot', 'tag', 'title', 'sort', 'limit', 'quality', 'freshness'];

/**
 * Pattern to detect wrong syntax (using = instead of :)
 */
const wrongSyntaxPattern = /\b(star|unread|read|clicked|cluster|hot|tag|title|sort|quality|freshness)=/i;

/**
 * Pattern to detect merged tokens (no space between expressions)
 */
const mergedTokenPattern = /(\d+\.?\d*|true|false)(star|unread|read|clicked|cluster|hot|tag|title|sort|quality|freshness|@)/i;

/**
 * Calculate Levenshtein distance between two strings for typo detection.
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} The edit distance between the strings
 */
export function levenshteinDistance(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

/**
 * Validate a query string against known expression patterns.
 * @param {string} query - The query string to validate
 * @param {Object} options - Validation options
 * @param {boolean} options.allowEmpty - Whether empty queries are valid (default: true for search, false for smart folders)
 * @returns {{ valid: boolean, error: string }} Validation result
 */
export function validateQuery(query, options = { allowEmpty: true }) {
    // Rule 1: Check empty query
    if (!query || query.trim() === '') {
        if (options.allowEmpty) {
            return { valid: true, error: '' };
        }
        return { valid: false, error: 'Query cannot be empty' };
    }

    const trimmedQuery = query.trim();
    
    // Rule 2: Check for common syntax errors (using = instead of :)
    if (wrongSyntaxPattern.test(trimmedQuery)) {
        return { valid: false, error: 'Use colon (:) not equals (=). Example: quality:0.6' };
    }

    // Rule 3: Check for merged tokens (no space between expressions)
    if (mergedTokenPattern.test(trimmedQuery)) {
        return { valid: false, error: 'Separate expressions with spaces. Example: quality:0.6 tag:ai' };
    }

    // Rule 4: Tokenize and validate each token
    // First handle multi-word patterns by replacing them with placeholders
    let workingQuery = trimmedQuery;
    const daysAgoMatch = workingQuery.match(/@"?(\d+)\s+days\s+ago"?/i);
    if (daysAgoMatch) {
        workingQuery = workingQuery.replace(daysAgoMatch[0], '__DAYSAGO_PLACEHOLDER__');
    }
    const lastDayMatch = workingQuery.match(/@"?last\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)"?/i);
    if (lastDayMatch) {
        workingQuery = workingQuery.replace(lastDayMatch[0], '__LASTDAY_PLACEHOLDER__');
    }

    // Split on whitespace/commas
    const tokens = workingQuery.split(/[\s,]+/).filter(Boolean);
    
    for (const token of tokens) {
        // Skip placeholders
        if (token === '__DAYSAGO_PLACEHOLDER__' || token === '__LASTDAY_PLACEHOLDER__') {
            continue;
        }

        const cleaned = token.replace(/[.,;]+$/, '');
        
        // Check if token matches any known pattern
        const isValidToken = expressionPatterns.some(p => p.regex.test(cleaned));
        
        if (!isValidToken) {
            // Check for typos in known keywords
            const colonIndex = cleaned.indexOf(':');
            if (colonIndex > 0) {
                const keyword = cleaned.substring(0, colonIndex).toLowerCase();
                // Check for close misspellings
                const similar = knownKeywords.find(kw => levenshteinDistance(keyword, kw) <= 2 && keyword !== kw);
                if (similar) {
                    return { valid: false, error: `Unknown keyword "${keyword}". Did you mean "${similar}"?` };
                }
                if (!knownKeywords.includes(keyword)) {
                    return { valid: false, error: `Unknown filter: "${keyword}". Valid filters: ${knownKeywords.join(', ')}` };
                }
            }
            
            // Token doesn't match any pattern - could be plain text search which is allowed
            // But if it looks like an expression attempt, flag it
            if (cleaned.includes(':') || cleaned.startsWith('@')) {
                return { valid: false, error: `Invalid expression: "${cleaned}"` };
            }
        }
    }

    return { valid: true, error: '' };
}

/**
 * Validate a search query (empty allowed).
 * @param {string} query - The search query to validate
 * @returns {{ valid: boolean, error: string }} Validation result
 */
export function validateSearchQuery(query) {
    return validateQuery(query, { allowEmpty: true });
}

/**
 * Validate a smart folder query (empty not allowed).
 * @param {string} query - The smart folder query to validate
 * @returns {{ valid: boolean, error: string }} Validation result
 */
export function validateSmartFolderQuery(query) {
    return validateQuery(query, { allowEmpty: false });
}

export default {
    expressionPatterns,
    knownKeywords,
    levenshteinDistance,
    validateQuery,
    validateSearchQuery,
    validateSmartFolderQuery
};
