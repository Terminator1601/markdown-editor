import { OpenAI } from 'openai';
import { NextResponse } from 'next/server';
import { parseMarkdownStructure, getSectionSummaries, extractSectionContent } from '@/utils/markdownParser';
import { validateContentSize, intelligentTruncate, CHAR_LIMITS } from '@/utils/contentManager';
import { createFormattingInstructions } from '@/utils/formatPreservation';
import { createLogger } from '@/utils/logger';

const logger = createLogger('CHAT-API');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Format transformation types
interface FormatTransformRequest {
    isTransformation: boolean;
    type: string | null;
    originalMessage: string;
}

// Format transformation detection
function detectFormatTransformation(userMessage: string): FormatTransformRequest {
    const message = userMessage.toLowerCase();
    
    const transformations = {
        checkbox: /convert.*to.*checkbox|make.*checkbox|turn.*into.*checkbox|sections.*to.*checkbox/i,
        mermaid: /make.*flowchart|create.*diagram|convert.*to.*mermaid|make.*sequence.*diagram|create.*chart/i,
        list: /convert.*to.*list|make.*list|turn.*into.*list/i,
        table: /convert.*to.*table|make.*table|turn.*into.*table/i,
        heading: /convert.*to.*heading|make.*heading|turn.*into.*heading/i,
        code: /convert.*to.*code|make.*code.*block|turn.*into.*code/i,
        quote: /convert.*to.*quote|make.*quote|turn.*into.*quote/i
    };
    
    for (const [type, regex] of Object.entries(transformations)) {
        if (regex.test(message)) {
            return {
                isTransformation: true,
                type,
                originalMessage: userMessage
            };
        }
    }
    
    return {
        isTransformation: false,
        type: null,
        originalMessage: userMessage
    };
}

// Generate specialized instructions for format transformations
function generateFormatTransformInstructions(formatRequest: FormatTransformRequest): string {
    const { type } = formatRequest;
    
    switch (type) {
        case 'checkbox':
            return `
SPECIALIZED FORMAT TRANSFORMATION - CHECKBOX:
- Convert headings/sections to checkbox format: - [ ] Item
- Convert list items to checkboxes
- Preserve the original text content
- Use unchecked boxes by default: - [ ]
- Maintain hierarchical structure if present
`;
        
        case 'mermaid':
            return `
SPECIALIZED FORMAT TRANSFORMATION - MERMAID:
- Wrap result in mermaid code block
- Use appropriate mermaid syntax (flowchart, sequence, class, etc.)
- For flowcharts: use 'flowchart TD' or 'flowchart LR'
- For sequences: use 'sequenceDiagram'
- Create proper node connections and relationships
- Use meaningful node IDs and labels
`;
        
        case 'list':
            return `
SPECIALIZED FORMAT TRANSFORMATION - LIST:
- Convert text blocks to list items
- Use - for bullet points or 1. for numbered lists
- Maintain logical grouping
- Preserve content hierarchy
`;
        
        case 'table':
            return `
SPECIALIZED FORMAT TRANSFORMATION - TABLE:
- Convert content to markdown table format
- Use | for column separators
- Include header row with alignment
- Extract relevant data points for columns
`;
        
        default:
            return '';
    }
}

export async function POST(req: Request) {
    const requestId = Math.random().toString(36).substr(2, 9);
    logger.info(`[${requestId}] Starting chat API request`);
    
    try {
        const { messages, currentContent, isSelection, selectedText, selectionStart, selectionEnd, isViewport, viewportInfo } = await req.json();

        logger.info(`[${requestId}] Request parameters:`, {
            messagesCount: messages?.length,
            contentLength: currentContent?.length,
            isSelection,
            selectedTextLength: selectedText?.length,
            isViewport,
            hasViewportInfo: !!viewportInfo,
            selectionRange: isSelection ? `${selectionStart}-${selectionEnd}` : null
        });

        if (!messages || !Array.isArray(messages)) {
            logger.error(`[${requestId}] Invalid messages format`);
            return NextResponse.json({ error: 'Invalid messages format' }, { status: 400 });
        }

        const userMessage = messages[messages.length - 1].content;
        let targetContent = currentContent;
        let targetStart = 0;
        let targetEnd = currentContent.length;
        let sectionAnalysis = null;
        let contentTruncated = false;
        let isWorkingWithSelection = false;

        // Handle selected text first (highest priority)
        if (isSelection && selectedText && selectedText.trim()) {
            targetContent = selectedText;
            targetStart = selectionStart || 0;
            targetEnd = selectionEnd || targetStart + selectedText.length;
            isWorkingWithSelection = true;
            
            if (isViewport) {
                logger.info(`[${requestId}] Working with viewport content`, {
                    range: `${targetStart}-${targetEnd}`,
                    preview: selectedText.substring(0, 100) + (selectedText.length > 100 ? '...' : ''),
                    viewportInfo
                });
            } else {
                logger.info(`[${requestId}] Working with selected text`, {
                    range: `${targetStart}-${targetEnd}`,
                    preview: selectedText.substring(0, 100) + (selectedText.length > 100 ? '...' : '')
                });
            }
        }

        // ENHANCED SMART CONTEXT ANALYSIS with size validation
        // Only run section analysis if we're not working with selected text and content is large
        else if (!isWorkingWithSelection && currentContent.length > 2000) {
            logger.info(`[${requestId}] Starting section analysis for large document`);
            try {
                const sections = parseMarkdownStructure(currentContent);
                const sectionSummaries = getSectionSummaries(sections);

                logger.info(`[${requestId}] Document structure parsed`, {
                    sectionsFound: sections.length,
                    sectionTitles: sections.map(s => s.title).slice(0, 5)
                });

                // Format summary for AI analysis
                const structureSummary = sectionSummaries.map((s, i) => 
                    `${i}. ${s.displayText}`
                ).join('\n');

                const analysisPrompt = `You are a smart context analyzer for document editing. Analyze which sections are most relevant to the user's request.

Document Structure:
${structureSummary}

User Request: "${userMessage}"

Instructions:
1. Identify which section(s) the user is most likely referring to
2. Consider the content and intent of the user's message
3. Return a JSON object with this exact structure:
{
  "relevantSections": [array of section indices (numbers)],
  "confidence": number between 0 and 1,
  "reasoning": "brief explanation of why these sections were chosen",
  "useWholeDocument": boolean
}

4. If the request is too general or applies to the entire document, set "useWholeDocument": true
5. If you're confident about specific sections, set "useWholeDocument": false and list the section indices
6. Only return the JSON object, no other text`;

                logger.info(`[${requestId}] Making section analysis API call`);
                logger.debug(`[${requestId}] OpenAI Analysis Input:`, {
                    model: 'gpt-4o-mini',
                    temperature: 0.1,
                    promptLength: analysisPrompt.length,
                    prompt: analysisPrompt.length > 1000 ? analysisPrompt.substring(0, 1000) + '...[truncated]' : analysisPrompt
                });
                
                const analysisCompletion = await openai.chat.completions.create({
                    model: 'gpt-4o-mini',
                    messages: [{ role: 'user', content: analysisPrompt }],
                    temperature: 0.1,
                });

                logger.info(`[${requestId}] Section analysis response received`, {
                    usage: analysisCompletion.usage,
                    finishReason: analysisCompletion.choices[0]?.finish_reason
                });
                
                const responseText = analysisCompletion.choices[0].message.content?.trim() || '{}';
                logger.debug(`[${requestId}] OpenAI Analysis Output:`, {
                    responseLength: responseText.length,
                    response: responseText.length > 500 ? responseText.substring(0, 500) + '...[truncated]' : responseText,
                    usage: analysisCompletion.usage
                });
                
                sectionAnalysis = JSON.parse(responseText);

                logger.info(`[${requestId}] Section analysis result`, sectionAnalysis);

                if (!sectionAnalysis.useWholeDocument && 
                    sectionAnalysis.relevantSections && 
                    sectionAnalysis.relevantSections.length > 0) {
                    
                    const targetSections = sectionAnalysis.relevantSections;
                    logger.info(`[${requestId}] Extracting content from sections: ${targetSections.join(', ')}`);
                    const extractionResult = extractSectionContent(currentContent, targetSections);
                    
                    targetContent = extractionResult.extractedContent;
                    targetStart = extractionResult.startChar;
                    targetEnd = extractionResult.endChar;
                    
                    console.log(`Enhanced Smart Context: Using sections [${targetSections.join(', ')}] (${targetStart}-${targetEnd})`);
                    console.log(`Confidence: ${sectionAnalysis.confidence}, Reasoning: ${sectionAnalysis.reasoning}`);
                } else {
                    console.log('Enhanced Smart Context: Using whole document');
                }
            } catch (analysisError) {
                console.error('Section analysis failed, using fallback logic:', analysisError);
                
                // Fallback to original logic
                const sections = parseMarkdownStructure(currentContent);
                const structureSummary = sections.map((s, i) => {
                    if (s.command === 'preamble') return `${i}. [Preamble]`;
                    return `${i}. \\${s.command}{${s.title}}`;
                }).join('\n');

                const simplifiedPrompt = `
Document structure:
${structureSummary}

User Request: "${userMessage}"

Return ONLY the index of the most relevant section (0-${sections.length - 1}), or -1 for whole document.
`;

                logger.info(`[${requestId}] Making fallback completion API call`);
                logger.debug(`[${requestId}] OpenAI Fallback Input:`, {
                    model: 'gpt-4o-mini',
                    temperature: 0,
                    promptLength: simplifiedPrompt.length,
                    prompt: simplifiedPrompt.length > 500 ? simplifiedPrompt.substring(0, 500) + '...[truncated]' : simplifiedPrompt
                });

                const fallbackCompletion = await openai.chat.completions.create({
                    model: 'gpt-4o-mini',
                    messages: [{ role: 'user', content: simplifiedPrompt }],
                    temperature: 0,
                });

                logger.debug(`[${requestId}] OpenAI Fallback Output:`, {
                    usage: fallbackCompletion.usage,
                    finishReason: fallbackCompletion.choices[0]?.finish_reason,
                    response: fallbackCompletion.choices[0].message.content?.trim()
                });

                const sectionIndex = parseInt(fallbackCompletion.choices[0].message.content?.trim() || '-1');

                if (sectionIndex >= 0 && sectionIndex < sections.length) {
                    const section = sections[sectionIndex];
                    targetContent = section.content;
                    targetStart = section.start;
                    targetEnd = section.end;
                    logger.info(`[${requestId}] Fallback Context: Focused on section "${section.title}" (${targetStart}-${targetEnd})`);
                }
            }
        }

        // Validate and potentially truncate content to avoid token limit
        // Account for system prompt overhead
        const systemPromptOverhead = 2000; // Estimated tokens for system prompt
        const maxContentChars = CHAR_LIMITS['gpt-4o-mini'] - (systemPromptOverhead * 4); // Convert tokens to chars
        
        const sizeValidation = validateContentSize(targetContent);
        if (!sizeValidation.valid || targetContent.length > maxContentChars) {
            logger.info(`[${requestId}] Content too large (${sizeValidation.estimatedTokens} tokens), applying intelligent truncation...`);
            const truncationResult = intelligentTruncate(
                targetContent, 
                maxContentChars,
                userMessage
            );
            targetContent = truncationResult.content;
            contentTruncated = truncationResult.truncated;
            logger.info(`[${requestId}] Content truncated: ${truncationResult.originalLength} -> ${targetContent.length} chars`);
        }

        // Generate formatting-specific instructions
        const formattingInstructions = createFormattingInstructions(targetContent, isWorkingWithSelection);
        
        // Detect formatting transformation requests
        const formatTransformRequest = detectFormatTransformation(userMessage);
        const isFormatTransformation = formatTransformRequest.isTransformation;
        
        let specializedInstructions = '';
        if (isFormatTransformation) {
            specializedInstructions = generateFormatTransformInstructions(formatTransformRequest);
            logger.info(`[${requestId}] Format transformation detected:`, formatTransformRequest);
        }

        const systemPrompt = `You are a helpful assistant that helps users edit Markdown/LaTeX documents and supports advanced format transformations.
You will be provided with content from a document - either selected text or a relevant section.
The user will ask you to make edits, format transformations, or ask questions about the content.

CRITICAL FORMATTING RULES - MUST FOLLOW EXACTLY:
1. NEVER modify LaTeX commands or their syntax: \\title{}, \\section{}, \\chapter{}, \\begin{}, \\end{}, etc.
2. NEVER add or remove special characters: ~, +, &, %, #, ^, _, $, {}, \\ UNLESS specifically requested by user
3. NEVER change spacing, indentation, or line breaks unless specifically requested
4. ONLY modify the content INSIDE braces {} when editing titles/sections
5. Keep all formatting, punctuation, and structure exactly as provided
6. If editing text, change ONLY the requested words, leave everything else untouched

FORMAT TRANSFORMATION CAPABILITIES:
- Convert sections/headings to checkboxes (- [ ] format)
- Convert lists to different formats (numbered, bulleted, checkboxes)
- Transform content to Mermaid diagram format (.mmd)
- Convert text blocks to code blocks, quotes, or tables
- Transform between different heading levels (# ## ###)
- Convert content to specific markup formats

MERMAID (.mmd) FORMAT TRANSFORMATIONS:
- Flowcharts: Use flowchart TD/LR syntax
- Sequence diagrams: Use sequenceDiagram syntax
- Class diagrams: Use classDiagram syntax  
- State diagrams: Use stateDiagram-v2 syntax
- Gantt charts: Use gantt syntax
- Pie charts: Use pie syntax
- Git graphs: Use gitgraph syntax

FORMAT TRANSFORMATION EXAMPLES:

User request: "convert sections to checkboxes"
Input: "# Task 1\n# Task 2\n# Task 3"
Output:
\`\`\`markdown
- [ ] Task 1
- [ ] Task 2
- [ ] Task 3
\`\`\`

User request: "make this a flowchart"
Input: "Process starts -> Validate data -> Save to database -> Send notification"
Output:
\`\`\`markdown
\`\`\`mermaid
flowchart TD
    A[Process starts] --> B[Validate data]
    B --> C[Save to database]
    C --> D[Send notification]
\`\`\`
\`\`\`

User request: "convert to sequence diagram"
Input: "User logs in, Server validates, Database checks, Response sent"
Output:
\`\`\`markdown
\`\`\`mermaid
sequenceDiagram
    participant U as User
    participant S as Server
    participant D as Database
    U->>S: Login request
    S->>D: Validate credentials
    D-->>S: Validation result
    S-->>U: Login response
\`\`\`
\`\`\`

INTELLIGENT TEXT MATCHING:
- When user says "replace X with Y", look for variations of X in the text
- Common abbreviations: USA = U.S.A. = United States of America
- Handle case variations: usa = USA = Usa = U.S.A.
- Look for similar words even with punctuation differences
- Examples:
  * "replace usa with india" should find and replace "U.S.A." with "india"
  * "replace us with uk" should find "U.S." and replace with "UK"
  * "replace america with france" should find "America" or "U.S.A." and replace

SELECTED TEXT HANDLING:
- You will receive ONLY the selected text that user wants to edit
- Return ONLY the modified version of that exact selected text
- Do NOT move content around or reorganize structure
- Do NOT add content from outside the selection
- Preserve the exact boundaries of the selected text

RESPONSE RULES:
- If user asks for an edit, provide ONLY the modified version wrapped in \`\`\`markdown
- If it's a question, answer normally without code blocks
- For selected text edits, return ONLY the modified selected text
- Make the minimal change possible - don't "improve" unrequested formatting

        ${formattingInstructions}
        
        ${specializedInstructions}

        Current context: ${sectionAnalysis ? 
            `Working with sections ${sectionAnalysis.relevantSections?.join(', ')} based on analysis` 
            : isWorkingWithSelection ? 
                (isViewport ? 'Working with viewport content' : 'Working with selected text')
            : 'Working with document content'}
        
        ${isWorkingWithSelection ? 
          (isViewport ? 'CONTEXT: You are editing VIEWPORT CONTENT (visible text) from a larger document. Return only the modified viewport text.' 
                     : 'CONTEXT: You are editing SELECTED TEXT from a larger document. Return only the modified selected text. DO NOT include content from outside the selection.') 
          : 'CONTEXT: You are editing a section or the full document.'}
          
EXAMPLES:

User request: "replace space with +"
Selected text: "\\title{ CONTROL VALVE SOURCEBOOK }"
Correct output: 
\`\`\`markdown
\\title{+CONTROL+VALVE+SOURCEBOOK+}
\`\`\`

User request: "change VALVE to PIPE"
Selected text: "\\title{ CONTROL VALVE SOURCEBOOK }"
Correct output: 
\`\`\`markdown
\\title{ CONTROL PIPE SOURCEBOOK }
\`\`\`

User request: "replace usa with india"
Selected text: "Printed in U.S.A."
Correct output:
\`\`\`markdown
Printed in india
\`\`\`

User request: "replace america with france"
Selected text: "Made in U.S.A."
Correct output:
\`\`\`markdown
Made in france
\`\`\`
`;

        logger.info(`[${requestId}] Making main completion API call`, {
            targetContentLength: targetContent.length,
            messagesCount: messages.length,
            model: 'gpt-4o-mini',
            streamMode: true,
            isWorkingWithSelection,
            isViewport: isViewport || false
        });
        
        const userPromptContent = `${isWorkingWithSelection ? 
                        (isViewport ? 'Viewport content to edit (return only modified viewport content):' : 'Selected text to edit (return ONLY the modified selected text, nothing more):') 
                        : 'Document content to edit:'}

\`\`\`markdown
${targetContent}
\`\`\`

${isWorkingWithSelection ? 
    'IMPORTANT: The above is the EXACT selected text. Return ONLY the modified version of this exact text. Do not add content from elsewhere in the document.' 
    : ''}`;
        
        logger.debug(`[${requestId}] OpenAI Main Input:`, {
            model: 'gpt-4o-mini',
            systemPromptLength: systemPrompt.length,
            systemPrompt: systemPrompt.length > 800 ? systemPrompt.substring(0, 800) + '...[truncated]' : systemPrompt,
            userPromptLength: userPromptContent.length,
            userPrompt: userPromptContent.length > 800 ? userPromptContent.substring(0, 800) + '...[truncated]' : userPromptContent,
            messagesCount: messages.length,
            lastMessage: messages[messages.length - 1]?.content?.substring(0, 200) + (messages[messages.length - 1]?.content?.length > 200 ? '...[truncated]' : '')
        });

        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemPrompt },
                {
                    role: 'user',
                    content: userPromptContent
                },
                ...messages,
            ],
            stream: true,
            temperature: 0.1, // Low temperature for more consistent formatting preservation
        });

        logger.info(`[${requestId}] OpenAI streaming response initiated`);

        const stream = new ReadableStream({
            async start(controller) {
                let chunkCount = 0;
                let totalContent = '';
                let firstChunk = true;
                
                for await (const chunk of response) {
                    chunkCount++;
                    const content = chunk.choices[0]?.delta?.content || '';
                    totalContent += content;
                    
                    if (firstChunk && content) {
                        logger.debug(`[${requestId}] OpenAI Main Output - First chunk:`, {
                            firstChunkContent: content.substring(0, 200) + (content.length > 200 ? '...' : ''),
                            chunkLength: content.length
                        });
                        firstChunk = false;
                    }
                    
                    controller.enqueue(new TextEncoder().encode(content));
                }
                
                logger.info(`[${requestId}] Streaming completed`, { 
                    chunksProcessed: chunkCount,
                    totalContentLength: totalContent.length
                });
                logger.debug(`[${requestId}] OpenAI Main Output - Complete:`, {
                    totalLength: totalContent.length,
                    preview: totalContent.length > 500 ? totalContent.substring(0, 500) + '...[truncated]' : totalContent
                });
                
                controller.close();
            },
        });

        logger.info(`[${requestId}] Response headers prepared`, {
            targetRange: `${targetStart}-${targetEnd}`,
            isSelection: isWorkingWithSelection,
            isViewport: isViewport || false,
            contentTruncated,
            targetContentLength: targetContent.length,
            sectionAnalysisUsed: !!sectionAnalysis
        });

        return new NextResponse(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'X-Target-Start': targetStart.toString(),
                'X-Target-End': targetEnd.toString(),
                'X-Section-Analysis': sectionAnalysis ? JSON.stringify(sectionAnalysis) : '',
                'X-Content-Truncated': contentTruncated.toString(),
                'X-Content-Length': targetContent.length.toString(),
                'X-Is-Selection': isWorkingWithSelection.toString(),
                'X-Is-Viewport': (isViewport || false).toString(),
                'X-Selected-Text-Length': isWorkingWithSelection ? selectedText?.length.toString() || '0' : '0',
                'X-Original-Selection-Start': (isSelection ? selectionStart.toString() : ''),
                'X-Original-Selection-End': (isSelection ? selectionEnd.toString() : ''),
            },
        });
    } catch (error) {
        logger.error(`[${requestId}] Chat API error:`, error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
