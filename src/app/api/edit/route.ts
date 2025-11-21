import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { message, selectedText, fullContent } = await request.json();

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // For this demo, we'll use a simple text-based transformation
    // In a real app, you'd integrate with OpenAI, Anthropic, or other LLM APIs
    const editProposal = await generateEditProposal(message, selectedText, fullContent);

    return NextResponse.json(editProposal);
  } catch (error) {
    console.error('Edit API error:', error);
    return NextResponse.json(
      { error: 'Failed to process edit request' },
      { status: 500 }
    );
  }
}

async function generateEditProposal(
  message: string,
  selectedText?: string,
  fullContent?: string
) {
  // Simple rule-based transformations for demo purposes
  // In production, this would call an actual LLM API
  
  const lowerMessage = message.toLowerCase();
  const original = selectedText || fullContent || '';
  let modified = original;
  let description = 'Applied text transformation';

  try {
    if (lowerMessage.includes('checklist') || lowerMessage.includes('checkbox')) {
      // Convert text to checklist format
      modified = convertToChecklist(original);
      description = 'Converted content to checklist format';
    } else if (lowerMessage.includes('bullet') || lowerMessage.includes('list')) {
      // Convert to bullet points
      modified = convertToBulletPoints(original);
      description = 'Converted content to bullet points';
    } else if (lowerMessage.includes('bold')) {
      // Make text bold
      modified = makeBold(original);
      description = 'Made text bold';
    } else if (lowerMessage.includes('italic')) {
      // Make text italic
      modified = makeItalic(original);
      description = 'Made text italic';
    } else if (lowerMessage.includes('heading') || lowerMessage.includes('title')) {
      // Convert to heading
      modified = convertToHeading(original);
      description = 'Converted to heading format';
    } else if (lowerMessage.includes('fix typo') || lowerMessage.includes('correct')) {
      // Simple typo corrections
      modified = fixCommonTypos(original);
      description = 'Fixed common typos';
    } else {
      // Fallback: simulate AI response
      description = 'AI suggested improvements';
      modified = await simulateAIEdit(original, message);
    }

    return {
      id: Date.now().toString(),
      original,
      modified,
      description
    };
  } catch (error) {
    console.error('Error generating edit proposal:', error);
    return {
      id: Date.now().toString(),
      original,
      modified: original,
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

async function simulateAIEdit(text: string, request: string): Promise<string> {
  // Simulate AI processing delay
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Simple transformations based on request keywords
  if (request.includes('shorter') || request.includes('concise')) {
    return text.length > 100 ? text.substring(0, 100) + '...' : text;
  }
  
  if (request.includes('expand') || request.includes('longer')) {
    return text + '\n\nAdditional context and details would be added here.';
  }

  if (request.includes('formal')) {
    return text.replace(/\b(can't|won't|don't|isn't)\b/g, (match) => {
      const formal: Record<string, string> = {
        "can't": "cannot",
        "won't": "will not",
        "don't": "do not",
        "isn't": "is not"
      };
      return formal[match] || match;
    });
  }

  // Default: return original with note
  return text + '\n\n*[AI Edit: This section has been reviewed and optimized.]*';
}