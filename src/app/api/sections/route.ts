import { NextRequest, NextResponse } from 'next/server';
import { OpenAI } from 'openai';
import { parseMarkdownStructure, getSectionSummaries, extractSectionContent } from '@/utils/markdownParser';
import { validateContentSize, intelligentTruncate, CHAR_LIMITS } from '@/utils/contentManager';
import { createLogger } from '@/utils/logger';

const logger = createLogger('SECTIONS-API');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
    const requestId = Math.random().toString(36).substr(2, 9);
    logger.info(`[${requestId}] Starting sections API request`);
    
    try {
        const { content, userInput } = await request.json();

        logger.info(`[${requestId}] Request parameters:`, {
            contentLength: content?.length,
            userInputLength: userInput?.length,
            userInputPreview: userInput?.substring(0, 100) + (userInput?.length > 100 ? '...' : '')
        });

        if (!content) {
            logger.error(`[${requestId}] Missing required content parameter`);
            return NextResponse.json({ error: 'Content is required' }, { status: 400 });
        }

        if (!userInput) {
            logger.error(`[${requestId}] Missing required userInput parameter`);
            return NextResponse.json({ error: 'User input is required' }, { status: 400 });
        }

        // Step 1: Parse document structure to get all sections
        logger.info(`[${requestId}] Parsing document structure`);
        const sections = parseMarkdownStructure(content);
        const sectionSummaries = getSectionSummaries(sections);

        logger.info(`[${requestId}] Document structure parsed`, {
            sectionsFound: sections.length,
            sectionTitles: sections.map(s => s.title).slice(0, 5)
        });

        // Step 2: Use AI to determine which sections are relevant to user input
        const structureSummary = sectionSummaries.map((s, i) => 
            `${i}. ${s.displayText}`
        ).join('\n');

        // Validate content size before sending to AI
        logger.info(`[${requestId}] Validating content size for AI processing`);
        const sizeValidation = validateContentSize(content);
        let analysisContent = content;
        let contentTruncated = false;

        if (!sizeValidation.valid) {
            logger.warn(`[${requestId}] Content size exceeds limits, truncating`, {
                originalSize: content.length,
                maxTokens: sizeValidation.maxTokens,
                estimatedTokens: sizeValidation.estimatedTokens
            });
            console.log(`Sections API: Content too large (${sizeValidation.estimatedTokens} tokens), applying truncation...`);
            const truncationResult = intelligentTruncate(content, CHAR_LIMITS['gpt-4o-mini'], userInput);
            analysisContent = truncationResult.content;
            contentTruncated = truncationResult.truncated;
        }

        const analysisPrompt = `You are a document section analyzer. Analyze which sections of this document are most relevant to the user's request.

Document Structure:
${structureSummary}

User Request: "${userInput}"

Instructions:
1. Identify the most relevant section(s) based on the user's request
2. Return a JSON object with the following structure:
{
  "relevantSections": [array of section indices (numbers)],
  "confidence": number between 0 and 1,
  "reasoning": "brief explanation of why these sections were chosen"
}

3. If the request is too general or applies to the entire document, return an empty array for relevantSections
4. If multiple sections are relevant, include all of them in the array
5. Only return the JSON object, no other text`;

        logger.info(`[${requestId}] Making sections analysis API call`);
        logger.debug(`[${requestId}] OpenAI Sections Input:`, {
            model: 'gpt-4o-mini',
            temperature: 0.1,
            promptLength: analysisPrompt.length,
            prompt: analysisPrompt.length > 1000 ? analysisPrompt.substring(0, 1000) + '...[truncated]' : analysisPrompt,
            userInputPreview: userInput.substring(0, 200) + (userInput.length > 200 ? '...' : '')
        });

        const analysisResponse = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: analysisPrompt }],
            temperature: 0.1,
        });

        logger.info(`[${requestId}] Sections analysis response received`, {
            usage: analysisResponse.usage,
            finishReason: analysisResponse.choices[0]?.finish_reason
        });

        let analysisResult;
        try {
            const responseText = analysisResponse.choices[0].message.content?.trim() || '{}';
            logger.debug(`[${requestId}] OpenAI Sections Output:`, {
                responseLength: responseText.length,
                response: responseText.length > 300 ? responseText.substring(0, 300) + '...[truncated]' : responseText,
                usage: analysisResponse.usage
            });
            
            analysisResult = JSON.parse(responseText);
        } catch (parseError) {
            logger.error(`[${requestId}] Failed to parse AI response:`, parseError);
            return NextResponse.json({ 
                error: 'Failed to analyze sections',
                sections: sectionSummaries,
                targetSections: [],
                extractedContent: content,
                startChar: 0,
                endChar: content.length
            });
        }

        // Step 3: Extract content from identified sections
        const targetSections = analysisResult.relevantSections || [];
        const extractionResult = extractSectionContent(content, targetSections);

        return NextResponse.json({
            sections: sectionSummaries,
            analysis: analysisResult,
            targetSections,
            extractedContent: extractionResult.extractedContent,
            startChar: extractionResult.startChar,
            endChar: extractionResult.endChar,
            targetedSectionDetails: extractionResult.sections,
            contentTruncated,
            originalContentLength: content.length,
            processedContentLength: analysisContent.length
        });

    } catch (error) {
        console.error('Section analysis error:', error);
        return NextResponse.json(
            { error: 'Failed to analyze sections' },
            { status: 500 }
        );
    }
}

// GET endpoint to just list sections without AI analysis
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const content = searchParams.get('content');

        if (!content) {
            return NextResponse.json({ error: 'Content parameter is required' }, { status: 400 });
        }

        const sections = parseMarkdownStructure(decodeURIComponent(content));
        const sectionSummaries = getSectionSummaries(sections);

        return NextResponse.json({
            sections: sectionSummaries,
            total: sections.length
        });

    } catch (error) {
        logger.error(`Sections API error:`, error);
        return NextResponse.json(
            { error: 'Failed to list sections' },
            { status: 500 }
        );
    }
}