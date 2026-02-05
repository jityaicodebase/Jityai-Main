/**
 * FUZZY MATCHER MODULE
 * Provides fuzzy string matching for better catalog mapping
 * Uses Levenshtein distance and token-based similarity
 */

class FuzzyMatcher {
    constructor(configLoader) {
        this.configLoader = configLoader;
    }

    /**
     * Calculate similarity between two strings (0-1)
     */
    similarity(str1, str2) {
        if (!str1 || !str2) return 0;

        const s1 = str1.toLowerCase().trim();
        const s2 = str2.toLowerCase().trim();

        if (s1 === s2) return 1.0;

        // Use combination of methods
        const levenshteinScore = this.levenshteinSimilarity(s1, s2);
        const tokenScore = this.tokenSimilarity(s1, s2);

        // Weighted average
        return (levenshteinScore * 0.4) + (tokenScore * 0.6);
    }

    /**
     * Levenshtein distance-based similarity
     */
    levenshteinSimilarity(str1, str2) {
        const distance = this.levenshteinDistance(str1, str2);
        const maxLength = Math.max(str1.length, str2.length);

        if (maxLength === 0) return 1.0;

        return 1 - (distance / maxLength);
    }

    /**
     * Calculate Levenshtein distance
     */
    levenshteinDistance(str1, str2) {
        const matrix = [];

        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }

        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1, // substitution
                        matrix[i][j - 1] + 1,     // insertion
                        matrix[i - 1][j] + 1      // deletion
                    );
                }
            }
        }

        return matrix[str2.length][str1.length];
    }

    /**
     * Token-based similarity (Jaccard)
     */
    tokenSimilarity(str1, str2) {
        const tokens1 = this.tokenize(str1);
        const tokens2 = this.tokenize(str2);

        if (tokens1.length === 0 && tokens2.length === 0) return 1.0;
        if (tokens1.length === 0 || tokens2.length === 0) return 0;

        const set1 = new Set(tokens1);
        const set2 = new Set(tokens2);

        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);

        return intersection.size / union.size;
    }

    /**
     * Tokenize string into meaningful words
     */
    tokenize(str) {
        return str
            .toLowerCase()
            .split(/\s+/)
            .filter(token => token.length > 2)
            .filter(token => !this.isStopWord(token));
    }

    /**
     * Check if word is a stop word
     */
    isStopWord(word) {
        const stopWords = ['the', 'and', 'for', 'with', 'pack', 'new', 'fresh'];
        return stopWords.includes(word);
    }

    /**
     * Find best match from a list of candidates
     */
    findBestMatch(query, candidates, threshold = 0.6) {
        let bestMatch = null;
        let bestScore = threshold;

        candidates.forEach(candidate => {
            const score = this.similarity(query, candidate.name || candidate);
            if (score > bestScore) {
                bestScore = score;
                bestMatch = {
                    item: candidate,
                    score: score
                };
            }
        });

        return bestMatch;
    }

    /**
     * Find all matches above threshold
     */
    findMatches(query, candidates, threshold = 0.6) {
        const matches = [];

        candidates.forEach(candidate => {
            const score = this.similarity(query, candidate.name || candidate);
            if (score >= threshold) {
                matches.push({
                    item: candidate,
                    score: score
                });
            }
        });

        return matches.sort((a, b) => b.score - a.score);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = FuzzyMatcher;
}
