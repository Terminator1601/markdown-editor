/**
 * Utility functions for managing content size and token limits
 */

// Approximate token count (1 token ≈ 4 characters for most text)
export function estimateTokenCount(text: string): number {
    return Math.ceil(text.length / 4);
}

// Maximum tokens for different models (leaving larger buffer for system prompt and response)
export const TOKEN_LIMITS = {
    'gpt-4o-mini': 100000, // 128k limit - 28k buffer for system prompt + response
    'gpt-4': 6000,         // 8k limit - 2k buffer
    'gpt-3.5-turbo': 14000 // 16k limit - 2k buffer
} as const;

// Maximum character limits (approximate, based on token limits)
export const CHAR_LIMITS = {
    'gpt-4o-mini': 400000, // ~100k tokens * 4 chars/token
    'gpt-4': 24000,        // ~6k tokens * 4 chars/token
    'gpt-3.5-turbo': 56000 // ~14k tokens * 4 chars/token
} as const;

export interface ContentChunk {
    content: string;
    startChar: number;
    endChar: number;
    estimatedTokens: number;
}

/**
 * Split large content into manageable chunks while preserving section boundaries
 */
export function chunkContent(
    content: string, 
    maxChars: number = CHAR_LIMITS['gpt-4o-mini']
): ContentChunk[] {
    if (content.length <= maxChars) {
        return [{
            content,
            startChar: 0,
            endChar: content.length,
            estimatedTokens: estimateTokenCount(content)
        }];
    }

    const chunks: ContentChunk[] = [];
    const lines = content.split('\n');
    let currentChunk = '';
    let currentStart = 0;
    let currentCharCount = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineWithNewline = line + '\n';
        
        // Check if adding this line would exceed the limit
        if (currentChunk.length + lineWithNewline.length > maxChars && currentChunk.length > 0) {
            // Save current chunk
            chunks.push({
                content: currentChunk.trimEnd(),
                startChar: currentStart,
                endChar: currentStart + currentChunk.length - 1,
                estimatedTokens: estimateTokenCount(currentChunk)
            });
            
            // Start new chunk
            currentStart = currentCharCount;
            currentChunk = lineWithNewline;
        } else {
            currentChunk += lineWithNewline;
        }
        
        currentCharCount += lineWithNewline.length;
    }

    // Add final chunk
    if (currentChunk.length > 0) {
        chunks.push({
            content: currentChunk.trimEnd(),
            startChar: currentStart,
            endChar: currentCharCount - 1,
            estimatedTokens: estimateTokenCount(currentChunk)
        });
    }

    return chunks;
}

/**
 * Find the most relevant chunk based on user query using simple heuristics
 */
export function findRelevantChunk(
    chunks: ContentChunk[], 
    userQuery: string
): ContentChunk {
    if (chunks.length === 0) {
        throw new Error('No chunks provided');
    }

    if (chunks.length === 1) {
        return chunks[0];
    }

    // Simple keyword matching heuristic
    const queryWords = userQuery.toLowerCase().split(/\s+/).filter(word => word.length > 2);
    
    const chunkScores = chunks.map(chunk => {
        const chunkText = chunk.content.toLowerCase();
        let score = 0;
        
        // Score based on keyword matches
        queryWords.forEach(word => {
            const matches = (chunkText.match(new RegExp(word, 'g')) || []).length;
            score += matches * word.length; // Longer words get higher weight
        });
        
        // Bonus for chunks with section headers
        if (/\\(title|section|chapter|subsection)\{/i.test(chunk.content)) {
            score += 10;
        }
        
        return { chunk, score };
    });

    // Sort by score and return best match
    chunkScores.sort((a, b) => b.score - a.score);
    
    // If no good matches found, return first chunk
    return chunkScores[0].score > 0 ? chunkScores[0].chunk : chunks[0];
}

/**
 * Truncate content intelligently, preserving important sections
 */
export function intelligentTruncate(
    content: string, 
    maxChars: number,
    userQuery?: string
): { content: string; truncated: boolean; originalLength: number } {
    if (content.length <= maxChars) {
        return { content, truncated: false, originalLength: content.length };
    }

    const chunks = chunkContent(content, maxChars);
    
    if (userQuery) {
        const relevantChunk = findRelevantChunk(chunks, userQuery);
        return {
            content: relevantChunk.content,
            truncated: true,
            originalLength: content.length
        };
    }

    // If no query provided, return first chunk
    return {
        content: chunks[0].content,
        truncated: true,
        originalLength: content.length
    };
}

/**
 * Validate content size for API calls
 */
export function validateContentSize(
    content: string, 
    model: keyof typeof CHAR_LIMITS = 'gpt-4o-mini'
): { valid: boolean; estimatedTokens: number; maxTokens: number; suggestion?: string } {
    const estimatedTokens = estimateTokenCount(content);
    const maxTokens = TOKEN_LIMITS[model];
    const valid = estimatedTokens <= maxTokens;

    return {
        valid,
        estimatedTokens,
        maxTokens,
        suggestion: valid ? undefined : `Content is too large (${estimatedTokens} tokens). Consider splitting into smaller sections or using content chunking.`
    };
}