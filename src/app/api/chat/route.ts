import { OpenAI } from 'openai';
import { NextResponse } from 'next/server';
import { parseMarkdownStructure } from '@/utils/markdownParser';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
    try {
        const { messages, currentContent, isSelection } = await req.json();

        if (!messages || !Array.isArray(messages)) {
            return NextResponse.json({ error: 'Invalid messages format' }, { status: 400 });
        }

        const userMessage = messages[messages.length - 1].content;
        let targetContent = currentContent;
        let targetStart = 0;
        let targetEnd = currentContent.length;

        // SMART CONTEXT ANALYSIS
        // If it's NOT a selection and the content is large (> 2000 chars), try to find the relevant section
        if (!isSelection && currentContent.length > 2000) {
            const sections = parseMarkdownStructure(currentContent);

            // Format summary with commands as requested: "\command{title}"
            const structureSummary = sections.map((s, i) => {
                if (s.command === 'preamble') return `${i}. [Preamble]`;
                return `${i}. \\${s.command}{${s.title}}`;
            }).join('\n');

            const analysisPrompt = `
You are a smart context analyzer. The user wants to edit a document that uses LaTeX-style commands for sections.
Here is the structure of the document:
${structureSummary}

User Request: "${userMessage}"

Identify which section(s) the user is referring to.
Return ONLY the index of the most relevant section (0-${sections.length - 1}).
If the request applies to the whole document or is unclear, return -1.
`;

            const analysisCompletion = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: analysisPrompt }],
                temperature: 0,
            });

            const sectionIndex = parseInt(analysisCompletion.choices[0].message.content?.trim() || '-1');

            if (sectionIndex >= 0 && sectionIndex < sections.length) {
                const section = sections[sectionIndex];
                targetContent = section.content;
                targetStart = section.start;
                targetEnd = section.end;
                console.log(`Smart Context: Focused on section "${section.title}" (${targetStart}-${targetEnd})`);
            }
        }

        const systemPrompt = `You are a helpful assistant that helps users edit Markdown/LaTeX documents.
You will be provided with the current content of a file OR a selected section of it.
The user will ask you to make edits or ask questions about the content.

IMPORTANT INSTRUCTIONS:
1. If the user asks for an edit, you should provide the modified content.
2. You must return ONLY the modified version of the provided text. Do not add surrounding context or repeat the whole file.
3. You MUST wrap the content in a code block with the language 'markdown'.
4. If the user asks a question without requesting an edit, answer it normally without a code block.

Example of Edit Response:
\`\`\`markdown
\\section*{Modified Title}
... modified content ...
\`\`\`
`;

        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemPrompt },
                {
                    role: 'user',
                    content: `Context:\n\`\`\`markdown\n${targetContent}\n\`\`\``
                },
                ...messages,
            ],
            stream: true,
        });

        const stream = new ReadableStream({
            async start(controller) {
                for await (const chunk of response) {
                    const content = chunk.choices[0]?.delta?.content || '';
                    controller.enqueue(new TextEncoder().encode(content));
                }
                controller.close();
            },
        });

        return new NextResponse(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'X-Target-Start': targetStart.toString(),
                'X-Target-End': targetEnd.toString(),
            },
        });
    } catch (error) {
        console.error('Error in chat API:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
