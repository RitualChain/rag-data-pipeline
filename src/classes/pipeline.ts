// src/pipeline.ts
import { DataLoader, RagDocument } from './data-loader';
import { VectorStore, EmbeddingModel as VectorStoreEmbeddingModel } from './vector-store'; // Renamed to avoid conflict
import { Retriever } from './retriever';
import { LLM, LLMResponse } from './llm';

// EmbeddingModel is imported from './vector-store' as VectorStoreEmbeddingModel

/**
 * @interface RAGPipelineConfig
 * Configuration for the entire RAG pipeline.
 */
export interface RAGPipelineConfig {
  dataLoader?: DataLoader; // Optional if documents are added directly to vector store
  vectorStore: VectorStore;
  retrieverEmbeddingModel: VectorStoreEmbeddingModel; // Model for embedding queries in Retriever
  llm: LLM;
  retrieverTopK?: number;
  retrieverSimilarityThreshold?: number; // Threshold for filtering out irrelevant documents (0-1)
  promptTemplate?: (context: string, query: string) => string;
}

/**
 * @class RAGPipeline
 * Orchestrates the entire RAG process from data ingestion (optional) to response generation.
 */
export class RAGPipeline {
  private dataLoader?: DataLoader;
  private vectorStore: VectorStore;
  private retriever: Retriever;
  private llm: LLM;
  private promptTemplate: (context: string, query: string) => string;

  constructor(config: RAGPipelineConfig) {
    this.dataLoader = config.dataLoader;
    this.vectorStore = config.vectorStore;
    this.llm = config.llm;

    this.retriever = new Retriever({
      vectorStore: this.vectorStore,
      embeddingModel: config.retrieverEmbeddingModel,
      topK: config.retrieverTopK,
      similarityThreshold: config.retrieverSimilarityThreshold || 0.7, // Default threshold for relevance
    });

    // Default prompt template if not provided
    this.promptTemplate = config.promptTemplate || ((context, query) => {
      return `Context information is provided below.\n---------------------\n${context}\n---------------------\nGiven the context information and not prior knowledge, answer the query.\nQuery: ${query}\nAnswer:`;
    });

    console.log('RAGPipeline initialized.');
  }

  /**
   * Ingests data using the configured DataLoader and adds it to the VectorStore.
   * This is an optional step if the VectorStore is pre-populated.
   * @returns Promise<void>
   */
  async ingestData(): Promise<void> {
    if (!this.dataLoader) {
      console.warn('No DataLoader configured for this pipeline. Skipping ingestion.');
      return;
    }
    console.log('Starting data ingestion process...');
    const documents = await this.dataLoader.loadAndChunk();
    await this.vectorStore.addDocuments(documents);
    console.log('Data ingestion complete.');
  }

  /**
   * Adds pre-processed documents directly to the vector store.
   * @param documents Document[]
   * @returns Promise<void>
   */
  async addDocuments(documents: RagDocument[]): Promise<void> {
    console.log(`Adding ${documents.length} pre-processed documents to the vector store...`);
    await this.vectorStore.addDocuments(documents);
    console.log('Pre-processed documents added.');
  }

  /**
   * Processes a query through the RAG pipeline to generate a response.
   * @param query string The user's query.
   * @returns Promise<LLMResponse>
   */
  async query(query: string): Promise<LLMResponse> {
    console.log(`Processing query with RAG pipeline: "${query}"`);

    // 1. Retrieve relevant documents
    const relevantDocuments = await this.retriever.retrieve(query);
    if (relevantDocuments.length === 0) {
      console.warn('No relevant documents found for the query.');
      // Return a response with empty sourceDocuments for unrelated queries
      return {
        text: "I couldn't find any specific information related to your query in my current knowledge base.",
        sourceDocuments: [], // Ensure sourceDocuments is part of the response even when no context
        metadata: { finishReason: 'no_context'}
      };
    }

    // 2. Format context
    const context = this.retriever.formatContext(relevantDocuments);

    // 3. Construct the prompt
    const fullPrompt = this.promptTemplate(context, query);
    console.log(`Constructed prompt (first 200 chars): ${fullPrompt.substring(0,200)}...`);

    // 4. Generate response using LLM
    const llmResponse = await this.llm.generate(fullPrompt);
    console.log('RAG pipeline query processing complete.');
  
    // Combine LLM response with source documents
    return {
      ...llmResponse,
      sourceDocuments: relevantDocuments,
    };
  }

  /**
   * (Optional) Processes a query and streams the response.
   * @param query string
   * @returns AsyncGenerator<string, void, undefined>
   */
  async *queryStream(query: string): AsyncGenerator<string, void, undefined> {
    console.log(`Streaming query with RAG pipeline: "${query}"`);
    const relevantDocuments = await this.retriever.retrieve(query);
    
    if (relevantDocuments.length === 0) {
        yield "I couldn't find any specific information related to your query in my current knowledge base.";
        return;
    }

    const context = this.retriever.formatContext(relevantDocuments);
    const fullPrompt = this.promptTemplate(context, query);
    
    yield* this.llm.generateStream(fullPrompt);
    console.log('RAG pipeline query streaming complete.');
  }
}

// Example Usage (for testing - requires setting up mock or real components)
/*
async function testRAGPipeline() {
  // Mock implementations (as used in individual component tests)
  class MockEmbeddingModel implements EmbeddingModel {
    name = 'mock-emb-model';
    async generateEmbeddings(texts: string[]): Promise<number[][]> {
      return texts.map(text => Array(10).fill(Math.random()));
    }
  }

  const mockEmbeddingModel = new MockEmbeddingModel();

  const mockVectorStore = new VectorStore({ provider: 'in-memory' }, 'dummy-api-key');
  // Pre-add some documents to the mock vector store
  await mockVectorStore.addDocuments([
    { id: 'f1_rules', content: 'Formula 1 rules changed significantly in 2022, focusing on ground effect.' },
    { id: 'f1_champion_2023', content: 'Max Verstappen, driving for Red Bull Racing, won the F1 championship in 2023.' },
  ]);

  const mockLLM = new LLM({ provider: 'openai', modelName: 'gpt-3.5-turbo-dummy', apiKey: 'dummy-key' });

  const pipeline = new RAGPipeline({
    vectorStore: mockVectorStore,
    retrieverEmbeddingModel: mockEmbeddingModel, // Model for query embedding
    llm: mockLLM,
    retrieverTopK: 1
  });

  // No dataLoader, vector store is pre-populated

  const query1 = 'What were the F1 rule changes in 2022?';
  const response1 = await pipeline.query(query1);
  console.log(`\nQuery 1: ${query1}\nResponse 1:`, response1.text);

  const query2 = 'Who was the F1 champion in 2023?';
  const response2 = await pipeline.query(query2);
  console.log(`\nQuery 2: ${query2}\nResponse 2:`, response2.text);
  
  const query3 = 'What is the capital of France?'; // Query with no context
  const response3 = await pipeline.query(query3);
  console.log(`\nQuery 3: ${query3}\nResponse 3:`, response3.text);

  console.log('\nTesting Streaming:');
  const streamQuery = 'Tell me about the 2023 F1 champion.';
  let streamedText = '';
  for await (const chunk of pipeline.queryStream(streamQuery)) {
    streamedText += chunk;
    process.stdout.write(chunk);
  }
  console.log('\nFull Streamed Text for F1 champion:', streamedText);
}

testRAGPipeline();
*/
