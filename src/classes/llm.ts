// src/llm.ts
import type { RagDocument } from './data-loader';
import OpenAI from 'openai';
import type { Stream } from 'openai/streaming';
import type { ChatCompletionChunk, ChatCompletion } from 'openai/resources/chat/completions';

// --- Configuration Interfaces ---

interface OpenAIConfig {
  provider: 'openai';
  modelName: string;
  apiKey: string; // OpenAI requires an API key
  temperature?: number;
  maxTokens?: number;
  // Add other OpenAI specific parameters if needed
}

// Add other provider configs here (Anthropic, HuggingFace, etc.)
// interface AnthropicConfig { provider: 'anthropic'; modelName: string; apiKey: string; ... }

export type LLMConfig = OpenAIConfig; // Add other configs to this union

// --- LLMResponse Interface ---

export interface LLMResponse {
  text: string;
  sourceDocuments?: RagDocument[]; // Added to include source documents
  metadata?: {
    finishReason?: string;
    tokenUsage?: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    };
    providerResponse?: any; // To store the raw response from the provider if needed
  };
}

// --- LLM Class ---

export class LLM {
  private config: LLMConfig;
  private openaiClient?: OpenAI;

  constructor(config: LLMConfig) {
    this.config = config;
    console.log(`LLM initializing for provider: ${config.provider}, model: ${config.modelName}...`);

    switch (config.provider) {
      case 'openai':
        if (!config.apiKey) {
          throw new Error('OpenAI API key is required for the OpenAI LLM provider.');
        }
        this.openaiClient = new OpenAI({ apiKey: config.apiKey });
        break;
      // Add cases for other providers
      default: {
        const _exhaustiveCheck = config;
        throw new Error(`Unsupported LLM provider: ${(_exhaustiveCheck as any).provider}`);
      }
    }
    console.log('LLM initialization complete.');
  }

  async generate(prompt: string): Promise<LLMResponse> {
    console.log(`Generating response from ${this.config.provider} for prompt starting with: "${prompt.substring(0, 50)}..."`);

    if (this.config.provider === 'openai' && this.openaiClient) {
      const openaiConfig = this.config; // Already type-narrowed
      try {
        const completion: ChatCompletion = await this.openaiClient.chat.completions.create({
          messages: [{ role: 'user', content: prompt }],
          model: openaiConfig.modelName,
          temperature: openaiConfig.temperature,
          max_tokens: openaiConfig.maxTokens,
        });

        const choice = completion.choices[0];
        return {
          text: choice.message?.content || '',
          metadata: {
            finishReason: choice.finish_reason,
            tokenUsage: {
              promptTokens: completion.usage?.prompt_tokens,
              completionTokens: completion.usage?.completion_tokens,
              totalTokens: completion.usage?.total_tokens,
            },
            providerResponse: completion,
          },
        };
      } catch (error) {
        console.error('Error generating response from OpenAI:', error);
        throw error; // Re-throw the error for the caller to handle
      }
    } else {
      // Fallback or error for unhandled providers, though constructor should prevent this
      console.warn(`Provider ${this.config.provider} not fully implemented for generate. Returning dummy response.`);
      const dummyText = `Dummy response for ${this.config.modelName}. Prompt: ${prompt.substring(0,30)}...`;
      return {
        text: dummyText,
        metadata: { finishReason: 'error', tokenUsage: { totalTokens: 0 } },
      };
    }
  }

  async *generateStream(prompt: string): AsyncGenerator<string, void, unknown> {
    console.log(`Streaming response from ${this.config.provider} for prompt: "${prompt.substring(0, 50)}..."`);

    if (this.config.provider === 'openai' && this.openaiClient) {
      const openaiConfig = this.config;
      try {
        const stream: Stream<ChatCompletionChunk> = await this.openaiClient.chat.completions.create({
          messages: [{ role: 'user', content: prompt }],
          model: openaiConfig.modelName,
          temperature: openaiConfig.temperature,
          max_tokens: openaiConfig.maxTokens,
          stream: true,
        });

        for await (const chunk of stream) {
          yield chunk.choices[0]?.delta?.content || '';
        }
      } catch (error) {
        console.error('Error streaming response from OpenAI:', error);
        // Handle stream errors appropriately, maybe yield an error object or re-throw
        // For now, re-throwing; the consumer needs to handle this.
        throw error;
      }
    } else {
      console.warn(`Provider ${this.config.provider} not fully implemented for generateStream. Yielding dummy stream.`);
      const dummyResponse = `Dummy streamed response for ${this.config.modelName}. Query: ${prompt.substring(0,20)}...`;
      const words = dummyResponse.split(' ');
      for (const word of words) {
        yield word + ' ';
        await new Promise(resolve => setTimeout(resolve, 20)); 
      }
    }
  }
}

/*
async function testLLM() {
  const openaiLLM = new LLM({
    provider: 'openai',
    modelName: 'gpt-3.5-turbo',
    apiKey: 'your-openai-api-key',
    temperature: 0.7,
  });

  const prompt = 'Context: Formula 1 is a sport. Max Verstappen won in 2023.\n\nQuery: Who won F1 in 2023?';
  const response = await openaiLLM.generate(prompt);
  console.log('LLM Response:', response);

  console.log('\nStreaming LLM Response:');
  let streamedText = '';
  for await (const chunk of openaiLLM.generateStream(prompt)) {
    streamedText += chunk;
    process.stdout.write(chunk);
  }
  console.log('\nFull Streamed Text:', streamedText);
}

testLLM();
*/
