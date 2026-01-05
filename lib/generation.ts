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
