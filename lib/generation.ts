/**
 * LLM-based quiz question generation using OpenAI API with RAG
 */

import OpenAI from 'openai';
import { findChunksForQuestionGeneration } from './vector-search';
import { estimateTokenCount } from './chunking';

export interface GeneratedQuestion {
  prompt: string;
  choices: string[];
  answer: number; // Index of correct answer
  explanation: string;
  sourceRef?: {
    page?: number;
    slide?: number;
    text?: string;
  };
}

let cachedOpenAI: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY environment variable is not set. Please configure it in your .env file.'
    );
  }

  if (!cachedOpenAI) {
    cachedOpenAI = new OpenAI({ apiKey });
  }

  return cachedOpenAI;
}

/**
 * Generate questions using RAG - retrieves relevant chunks from the document
 * @param documentId Document ID to generate questions for
 * @param count Number of questions to generate
 * @returns Array of generated questions
 */
export async function generateQuestions(
  documentId: number,
  count: number = 8
): Promise<GeneratedQuestion[]> {
  const openai = getOpenAIClient();

  // Retrieve relevant chunks using RAG
  console.log('[rag] Retrieving chunks for document', documentId);
  const chunks = await findChunksForQuestionGeneration(documentId, count);
  console.log('[rag] Retrieved', chunks.length, 'chunks');

  if (chunks.length === 0) {
    throw new Error('No chunks found for document. Please ensure the document has been processed.');
  }

  // Combine chunks into text, respecting token limits
  // Target: ~20-25k tokens for content (leaving room for prompt/response)
  const maxTokens = 25000;
  const combinedChunks: string[] = [];
  let totalTokens = 0;

  for (const chunk of chunks) {
    const chunkTokens = chunk.tokenCount || estimateTokenCount(chunk.text);
    
    if (totalTokens + chunkTokens > maxTokens) {
      // If adding this chunk would exceed limit, stop
      // But if we have very few chunks, include it anyway (better to have content)
      if (combinedChunks.length >= 5) {
        break;
      }
    }

    combinedChunks.push(chunk.text);
    totalTokens += chunkTokens;
  }

  const combinedText = combinedChunks.join('\n\n');
  console.log('[rag] Combined', combinedChunks.length, 'chunks into', totalTokens, 'tokens');

  const systemPrompt = `You are an expert educator creating high-quality multiple-choice quiz questions from educational content. 
Generate questions that:
- Test understanding of key concepts
- Are clear and unambiguous
- Have exactly 4 answer choices
- Include one clearly correct answer and 3 plausible distractors
- Provide detailed explanations for the correct answer
- Reference the source material when possible

Return your response as a JSON object with a "questions" array. Each question must have:
- "prompt": string (the question text)
- "choices": string[] (exactly 4 answer choices)
- "answer": number (0-3 index of the correct answer)
- "explanation": string (detailed explanation of why the answer is correct)
- "sourceRef": object (optional, with "page", "slide", or "text" fields if available)`;

  const userPrompt = `Generate ${count} multiple-choice questions based on the following content:

${combinedText}

Return the questions as a JSON object with this exact structure:
{
  "questions": [
    {
      "prompt": "Question text here?",
      "choices": ["Choice A", "Choice B", "Choice C", "Choice D"],
      "answer": 0,
      "explanation": "Detailed explanation here",
      "sourceRef": {
        "text": "Relevant source text excerpt"
      }
    }
  ]
}`;

  try {
    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || 'gpt-5-nano', // Use gpt-5-nano by default for cost efficiency
      instructions: systemPrompt,
      input: userPrompt,
      text: { format: { type: 'json_object' } },
      reasoning: { effort: "low" },
      max_output_tokens: 8000, // Enough for multiple questions with explanations
    });

    if (response.error) {
      throw new Error(
        `OpenAI response error: ${response.error.message || response.error.code || 'Unknown error'}`
      );
    }

    const content = response.output_text;
    if (!content) {
      throw new Error('No response content from OpenAI API');
    }

    // Parse the JSON response
    let parsedResponse: { questions?: GeneratedQuestion[] };
    try {
      parsedResponse = JSON.parse(content);
    } catch (parseError) {
      console.error('Failed to parse OpenAI response:', content);
      throw new Error('Invalid JSON response from OpenAI API');
    }

    // Validate response structure
    if (!parsedResponse.questions || !Array.isArray(parsedResponse.questions)) {
      throw new Error('Invalid response format: missing questions array');
    }

    // Validate and clean up each question
    const questions: GeneratedQuestion[] = parsedResponse.questions
      .slice(0, count) // Ensure we don't exceed requested count
      .map((q: any, index: number) => {
        // Validate required fields
        if (!q.prompt || !Array.isArray(q.choices) || typeof q.answer !== 'number') {
          throw new Error(
            `Invalid question format at index ${index}: missing required fields`
          );
        }

        // Ensure exactly 4 choices
        if (q.choices.length !== 4) {
          throw new Error(
            `Question at index ${index} must have exactly 4 choices, got ${q.choices.length}`
          );
        }

        // Validate answer index
        if (q.answer < 0 || q.answer >= 4) {
          throw new Error(
            `Question at index ${index} has invalid answer index: ${q.answer} (must be 0-3)`
          );
        }

        return {
          prompt: String(q.prompt).trim(),
          choices: q.choices.map((c: any) => String(c).trim()),
          answer: Number(q.answer),
          explanation: q.explanation ? String(q.explanation).trim() : '',
          sourceRef: q.sourceRef || undefined,
        };
      });

    if (questions.length === 0) {
      throw new Error('No valid questions generated');
    }

    return questions;
  } catch (error) {
    // Re-throw if it's already our custom error
    if (error instanceof Error && error.message.includes('OPENAI_API_KEY')) {
      throw error;
    }

    // Handle OpenAI API errors
    if (error instanceof OpenAI.APIError) {
      console.error('OpenAI API Error:', error.status, error.message);
      throw new Error(
        `OpenAI API error: ${error.message}. Please check your API key and try again.`
      );
    }

    // Handle other errors
    console.error('Error generating questions:', error);
    throw new Error(
      `Failed to generate questions: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

export interface SummarySection {
  title: string;
  points: string[];
}

/**
 * Generate summary as organized sections with bullet points from extracted text
 * @param extractedText The extracted text from the document
 * @returns Array of summary sections with titles and bullet points
 */
export async function generateSummary(
  extractedText: string
): Promise<SummarySection[]> {
  const openai = getOpenAIClient();

  if (!extractedText || extractedText.trim().length === 0) {
    throw new Error('Extracted text is empty. Cannot generate summary.');
  }

  // Limit text length to avoid token limits
  // Target: ~20-25k tokens for content (leaving room for prompt/response)
  const maxTokens = 25000;
  let textToSummarize = extractedText;
  
  // Rough estimate: 1 token ≈ 4 characters
  const estimatedTokens = Math.ceil(textToSummarize.length / 4);
  if (estimatedTokens > maxTokens) {
    // Truncate to approximately maxTokens
    const maxChars = maxTokens * 4;
    textToSummarize = textToSummarize.substring(0, maxChars);
    console.log('[summary] Truncated text to fit token limit', { 
      originalLength: extractedText.length,
      truncatedLength: textToSummarize.length 
    });
  }

  const systemPrompt = `You are an expert educator creating well-organized summaries of educational content. 
Generate a structured summary organized into logical sections with clear titles and bullet points.
- Organize content into 3-6 thematic sections (e.g., "Key Concepts", "Important Definitions", "Main Takeaways", "Applications", etc.)
- Each section should have a clear, descriptive title
- Include 2-5 bullet points per section
- Use bold formatting for key terms within bullet points (use **term** syntax)
- Focus on the most important concepts and information
- Use clear, concise language
- Each bullet point should be a complete, meaningful statement

Return your response as a JSON object with a "sections" array. Each section must have a "title" and "points" array.`;

  const userPrompt = `Create a well-organized summary with labeled sections from the following lecture slide content:

${textToSummarize}

Return the summary as a JSON object with this exact structure:
{
  "sections": [
    {
      "title": "Section Title Here",
      "points": [
        "First key point with **important term** highlighted",
        "Second important point",
        "Third main idea"
      ]
    },
    {
      "title": "Another Section",
      "points": [
        "Point one",
        "Point two"
      ]
    }
  ]
}`;

  try {
    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || 'gpt-5-nano', // Use gpt-5-nano by default for cost efficiency
      instructions: systemPrompt,
      input: userPrompt,
      text: { format: { type: 'json_object' } },
      reasoning: { effort: "low" },
      max_output_tokens: 6000, // Enough for multiple sections with bullet points
    });

    if (response.error) {
      throw new Error(
        `OpenAI response error: ${response.error.message || response.error.code || 'Unknown error'}`
      );
    }

    const content = response.output_text;
    if (!content) {
      throw new Error('No response content from OpenAI API');
    }

    // Parse the JSON response
    let parsedResponse: { sections?: Array<{ title: string; points: string[] }> };
    try {
      parsedResponse = JSON.parse(content);
    } catch (parseError) {
      console.error('Failed to parse OpenAI response:', content);
      throw new Error('Invalid JSON response from OpenAI API');
    }

    // Validate response structure
    if (!parsedResponse.sections || !Array.isArray(parsedResponse.sections)) {
      throw new Error('Invalid response format: missing sections array');
    }

    // Validate and clean up each section
    const sections: SummarySection[] = parsedResponse.sections
      .map((section: any, sectionIndex: number) => {
        if (!section || typeof section !== 'object') {
          throw new Error(
            `Invalid section at index ${sectionIndex}: must be an object`
          );
        }
        if (!section.title || typeof section.title !== 'string') {
          throw new Error(
            `Invalid section title at index ${sectionIndex}: must be a string`
          );
        }
        if (!Array.isArray(section.points)) {
          throw new Error(
            `Invalid section points at index ${sectionIndex}: must be an array`
          );
        }

        const points = section.points
          .map((point: any, pointIndex: number) => {
            if (!point || typeof point !== 'string') {
              throw new Error(
                `Invalid point at section ${sectionIndex}, point ${pointIndex}: must be a string`
              );
            }
            return String(point).trim();
          })
          .filter((point: string) => point.length > 0); // Remove empty points

        if (points.length === 0) {
          throw new Error(
            `Section "${section.title}" has no valid points`
          );
        }

        return {
          title: String(section.title).trim(),
          points,
        };
      })
      .filter((section: SummarySection) => section.points.length > 0); // Remove sections with no points

    if (sections.length === 0) {
      throw new Error('No valid summary sections generated');
    }

    const totalPoints = sections.reduce((sum, section) => sum + section.points.length, 0);
    console.log('[summary] Generated summary', { sectionCount: sections.length, totalPointCount: totalPoints });
    return sections;
  } catch (error) {
    // Re-throw if it's already our custom error
    if (error instanceof Error && error.message.includes('OPENAI_API_KEY')) {
      throw error;
    }

    // Handle OpenAI API errors
    if (error instanceof OpenAI.APIError) {
      console.error('OpenAI API Error:', error.status, error.message);
      throw new Error(
        `OpenAI API error: ${error.message}. Please check your API key and try again.`
      );
    }

    // Handle other errors
    console.error('Error generating summary:', error);
    throw new Error(
      `Failed to generate summary: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
