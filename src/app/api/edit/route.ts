import { NextRequest, NextResponse } from 'next/server';
import { OpenAI } from 'openai';
import { parseMarkdownStructure, getSectionSummaries, extractSectionContent } from '@/utils/markdownParser';
import { validateContentSize, intelligentTruncate, CHAR_LIMITS } from '@/utils/contentManager';
import { createLogger } from '@/utils/logger';

const logger = createLogger('EDIT-API');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  const requestId = Math.random().toString(36).substr(2, 9);
  logger.info(`[${requestId}] Starting edit API request`);
  
  try {
    const { message, selectedText, fullContent, useSectionTargeting = true, selectionStart, selectionEnd } = await request.json();

    logger.info(`[${requestId}] Request parameters:`, {
      messageLength: message?.length,
      selectedTextLength: selectedText?.length,
      fullContentLength: fullContent?.length,
      useSectionTargeting,
      selectionRange: selectedText ? `${selectionStart}-${selectionEnd}` : null
    });

    if (!message) {
      logger.error(`[${requestId}] Missing required message parameter`);
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    let targetContent = fullContent || '';
    let startChar = 0;
    let endChar = targetContent.length;
    let analysisResult = null;
    let contentTruncated = false;
    let isWorkingWithSelection = false;

    // Handle selected text first (highest priority)
    if (selectedText && selectedText.trim()) {
      targetContent = selectedText;
      startChar = selectionStart || 0;
      endChar = selectionEnd || startChar + selectedText.length;
      isWorkingWithSelection = true;
      
      logger.info(`[${requestId}] Working with selected text`, {
        range: `${startChar}-${endChar}`,
        preview: selectedText.substring(0, 100) + (selectedText.length > 100 ? '...' : '')
      });
      
      logger.info(`[${requestId}] Edit API: Working with selected text (${startChar}-${endChar}): "${selectedText.substring(0, 100)}..."`);
    }

    // If we have full content and no specific selection, use section targeting
    else if (useSectionTargeting && fullContent && !isWorkingWithSelection && fullContent.length > 1000) {
      try {
        // Step 1: Analyze which sections are relevant to the user's request
        const sections = parseMarkdownStructure(fullContent);
        const sectionSummaries = getSectionSummaries(sections);

        const structureSummary = sectionSummaries.map((s, i) => 
          `${i}. ${s.displayText}`
        ).join('\n');

        const analysisPrompt = `You are a document section analyzer. Determine which sections are most relevant to the user's edit request.

Document Structure:
${structureSummary}

User Edit Request: "${message}"

Return a JSON object:
{
  "relevantSections": [array of section indices],
  "confidence": number between 0 and 1,
  "reasoning": "brief explanation"
}

If the request is too general, return empty array. Only return JSON.`;

        const analysisResponse = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: analysisPrompt }],
          temperature: 0.1,
        });

        const responseText = analysisResponse.choices[0].message.content?.trim() || '{}';
        analysisResult = JSON.parse(responseText);
        
        const targetSections = analysisResult.relevantSections || [];
        
        if (targetSections.length > 0) {
          const extractionResult = extractSectionContent(fullContent, targetSections);
          targetContent = extractionResult.extractedContent;
          startChar = extractionResult.startChar;
          endChar = extractionResult.endChar;
          
          console.log(`Section targeting: Using sections [${targetSections.join(', ')}] (${startChar}-${endChar})`);
        } else {
          console.log('Section targeting: Using full content (general request)');
          targetContent = fullContent;
        }
      } catch (sectionError) {
        logger.warn(`[${requestId}] Section analysis failed, falling back to full content:`, sectionError);
        targetContent = fullContent;
      }
    }

    // Validate and potentially truncate content to avoid token limit
    const sizeValidation = validateContentSize(targetContent);
    if (!sizeValidation.valid) {
      console.log(`Edit API: Content too large (${sizeValidation.estimatedTokens} tokens), applying intelligent truncation...`);
      const truncationResult = intelligentTruncate(
        targetContent, 
        CHAR_LIMITS['gpt-4o-mini'],
        message
      );
      targetContent = truncationResult.content;
      contentTruncated = truncationResult.truncated;
      
      // Adjust char positions if we truncated
      if (contentTruncated && fullContent) {
        endChar = startChar + targetContent.length;
      }
      
      console.log(`Edit API: Content truncated: ${truncationResult.originalLength} -> ${targetContent.length} chars`);
    }

    // Generate edit proposal using OpenAI
    const editProposal = await generateOpenAIEditProposal(requestId, message, targetContent, isWorkingWithSelection);

    return NextResponse.json({
      ...editProposal,
      sectionAnalysis: analysisResult,
      targetRange: { startChar, endChar },
      originalLength: targetContent.length,
      contentTruncated,
      isWorkingWithSelection,
      sizeValidation: validateContentSize(targetContent)
    });
  } catch (error) {
    logger.error(`[${requestId}] Edit API error:`, error);
    return NextResponse.json(
      { error: 'Failed to process edit request' },
      { status: 500 }
    );
  }
}

async function generateOpenAIEditProposal(requestId: string, message: string, content: string, isSelection: boolean = false) {
  try {
    const systemPrompt = `You are an expert document editor specializing in Markdown and LaTeX documents.

CRITICAL INSTRUCTIONS:
1. You will receive content to edit based on the user's request
2. Return ONLY the edited content, preserving the exact original formatting
3. DO NOT add explanations, comments, or surrounding text
4. PRESERVE all original formatting elements:
   - LaTeX commands (\\section{}, \\title{}, \\chapter{}, etc.) exactly as written
   - Indentation and spacing
   - Line breaks and paragraph structure
   - Special characters and symbols
   - List formatting and numbering
   - Table structures

${isSelection ? 
'CONTEXT: You are editing SELECTED TEXT. Return only the modified selected text, maintaining its exact format and structure.' :
'CONTEXT: You are editing document content. Preserve the document structure and formatting.'
}

FORMATTING RULES:
- Keep LaTeX commands unchanged unless specifically requested to modify them
- Maintain consistent spacing and indentation
- Preserve line endings and paragraph breaks
- Do not change formatting unless explicitly requested
- Make only the specific changes requested by the user`;

    const userPrompt = `Please edit the following content based on this request: "${message}"

Content to edit:
${content}

Remember: Return ONLY the edited content with preserved formatting.`;

    logger.info(`[${requestId}] Making main edit API call`, {
      targetContentLength: content.length,
      model: 'gpt-4o-mini',
      temperature: 0.1
    });
    
    logger.debug(`[${requestId}] OpenAI Edit Main Input:`, {
      model: 'gpt-4o-mini',
      temperature: 0.1,
      systemPromptLength: systemPrompt.length,
      systemPrompt: systemPrompt.length > 800 ? systemPrompt.substring(0, 800) + '...[truncated]' : systemPrompt,
      userPromptLength: userPrompt.length,
      userPrompt: userPrompt.length > 800 ? userPrompt.substring(0, 800) + '...[truncated]' : userPrompt
    });

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.1, // Lower temperature for more consistent formatting
    });

    logger.info(`[${requestId}] Edit API response received`, {
      usage: response.usage,
      finishReason: response.choices[0]?.finish_reason
    });
    
    const modifiedContent = response.choices[0].message.content?.trim() || content;
    
    logger.debug(`[${requestId}] OpenAI Edit Main Output:`, {
      originalContentLength: content.length,
      modifiedContentLength: modifiedContent.length,
      modifiedContent: modifiedContent.length > 500 ? modifiedContent.substring(0, 500) + '...[truncated]' : modifiedContent,
      usage: response.usage
    });

    return {
      id: Date.now().toString(),
      original: content,
      modified: modifiedContent,
      description: `Applied AI edit: ${message}${isSelection ? ' (Selected Text)' : ''}`
    };
  } catch (error) {
    logger.error(`OpenAI edit generation failed:`, error);
    
    // Fallback to simple text transformations
    return generateSimpleEditProposal(requestId, message, content);
  }
}

async function generateSimpleEditProposal(requestId: string, message: string, content: string) {
  const lowerMessage = message.toLowerCase();
  let modified = content;
  let description = 'Applied text transformation';

  try {
    if (lowerMessage.includes('checklist') || lowerMessage.includes('checkbox')) {
      // Convert text to checklist format
      modified = convertToChecklist(content);
      description = 'Converted content to checklist format';
    } else if (lowerMessage.includes('bullet') || lowerMessage.includes('list')) {
      // Convert to bullet points
      modified = convertToBulletPoints(content);
      description = 'Converted content to bullet points';
    } else if (lowerMessage.includes('bold')) {
      // Make text bold
      modified = makeBold(content);
      description = 'Made text bold';
    } else if (lowerMessage.includes('italic')) {
      // Make text italic
      modified = makeItalic(content);
      description = 'Made text italic';
    } else if (lowerMessage.includes('heading') || lowerMessage.includes('title')) {
      // Convert to heading
      modified = convertToHeading(content);
      description = 'Converted to heading format';
    } else if (lowerMessage.includes('fix typo') || lowerMessage.includes('correct')) {
      // Simple typo corrections
      modified = fixCommonTypos(content);
      description = 'Fixed common typos';
    } else {
      // Fallback: return original with note
      description = 'Simple edit applied';
      modified = content + '\n\n*[Edit applied based on request: ' + message + ']*';
    }

    return {
      id: Date.now().toString(),
      original: content,
      modified,
      description
    };
  } catch (error) {
    logger.error(`Error generating simple edit proposal:`, error);
    return {
      id: Date.now().toString(),
      original: content,
      modified: content,
      description: 'Unable to process edit request'
    };
  }
}

function convertToChecklist(text: string): string {
  return text
    .split('\n')
    .filter(line => line.trim())
    .map(line => `- [ ] ${line.trim()}`)
    .join('\n');
}

function convertToBulletPoints(text: string): string {
  return text
    .split('\n')
    .filter(line => line.trim())
    .map(line => `- ${line.trim()}`)
    .join('\n');
}

function makeBold(text: string): string {
  return `**${text}**`;
}

function makeItalic(text: string): string {
  return `*${text}*`;
}

function convertToHeading(text: string): string {
  return `## ${text.trim()}`;
}

function fixCommonTypos(text: string): string {
  const typoMap: Record<string, string> = {
    'teh': 'the',
    'adn': 'and',
    'recieve': 'receive',
    'seperate': 'separate',
    'occured': 'occurred',
    'neccessary': 'necessary',
    'definately': 'definitely'
  };

  let fixed = text;
  Object.entries(typoMap).forEach(([typo, correction]) => {
    const regex = new RegExp(`\\b${typo}\\b`, 'gi');
    fixed = fixed.replace(regex, correction);
  });

  return fixed;
}