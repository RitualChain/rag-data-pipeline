// src/retriever.ts
import { VectorStore, EmbeddingModel } from './vector-store'; // Assuming interfaces are here
import { RagDocument } from './data-loader';

/**
 * @interface RetrieverConfig
 * Configuration for the retriever.
 */
export interface RetrieverConfig {
  vectorStore: VectorStore;
  embeddingModel: EmbeddingModel; // Model to embed the query
  topK?: number; // Number of results to retrieve
  similarityThreshold?: number; // Threshold for filtering out irrelevant documents (0-1)
  // Add other config like re-ranking options, etc.
}

/**
 * @class Retriever
 * Handles the process of taking a query, embedding it, and retrieving relevant documents.
 */
export class Retriever {
  private vectorStore: VectorStore;
  private embeddingModel: EmbeddingModel;
  private topK: number;
  private similarityThreshold: number;

  constructor(config: RetrieverConfig) {
    this.vectorStore = config.vectorStore;
    this.embeddingModel = config.embeddingModel;
    this.topK = config.topK || 5; // Default to 5 results
    this.similarityThreshold = config.similarityThreshold || 0.7; // Default similarity threshold
    console.log(`Retriever initialized. Will fetch top ${this.topK} results with similarity threshold ${this.similarityThreshold}.`);
  }

  /**
   * Retrieves relevant documents for a given query string.
   * @param query string The user's query.
   * @returns Promise<Document[]>
   */
  async retrieve(query: string): Promise<RagDocument[]> {
    console.log(`Retrieving documents for query: "${query}"`);

    // 1. Embed the query
    const [queryEmbedding] = await this.embeddingModel.generateEmbeddings([query]);
    if (!queryEmbedding) {
      console.error('Failed to generate query embedding.');
      return [];
    }
    console.log('Query embedded successfully.');

    // 2. Perform similarity search in the vector store
    const retrievedDocuments = await this.vectorStore.similaritySearch(queryEmbedding, this.topK);
    console.log(`Retrieved ${retrievedDocuments.length} documents from vector store.`);

    // 3. Filter documents based on similarity threshold
    const relevantDocuments = retrievedDocuments.filter(doc => {
      // If similarity score is available, use it for filtering
      if (doc.similarity !== undefined) {
        const isRelevant = doc.similarity >= this.similarityThreshold;
        if (!isRelevant) {
          console.log(`Filtering out document ${doc.id} with similarity ${doc.similarity} (below threshold ${this.similarityThreshold})`);
        }
        return isRelevant;
      }
      // If no similarity score is available, keep the document
      return true;
    });

    console.log(`After filtering, ${relevantDocuments.length} relevant documents remain.`);
    return relevantDocuments;
  }

  /**
   * Formats retrieved documents into a context string for the LLM.
   * @param documents Document[]
   * @returns string
   */
  formatContext(documents: RagDocument[]): string {
    return documents.map(doc => doc.content).join('\n\n---\n\n');
  }
}

// Example Usage (for testing)
// async function testRetriever() {
//   // Mock EmbeddingModel and VectorStore for testing
//   class MockEmbeddingModel implements EmbeddingModel {
//     name = 'mock-model';
//     async generateEmbeddings(texts: string[]): Promise<number[][]> {
//       return texts.map(text => Array(10).fill(Math.random()));
//     }
//   }
//
//   class MockVectorStore extends VectorStore {
//     constructor() {
//       super({ provider: 'in-memory' });
//     }
//     async similaritySearch(queryEmbedding: number[], topK: number): Promise<RagDocument[]> {
//       return [
//         { id: 'res1', content: 'Mocked result 1 based on query.', metadata: { score: 0.9 } },
//         { id: 'res2', content: 'Mocked result 2, also relevant.', metadata: { score: 0.8 } },
//       ].slice(0, topK);
//     }
//     async addDocuments(documents: RagDocument[]): Promise<void> { /* no-op for mock */ }
//   }
//
//   const embeddingModel = new MockEmbeddingModel();
//   const vectorStore = new MockVectorStore();
//   // Add some dummy docs to the mock store if its addDocuments was functional
//   // await vectorStore.addDocuments([{id: 'test', content: 'test content'}]);
//
//   const retriever = new Retriever({
//     vectorStore,
//     embeddingModel,
//     topK: 2,
//   });
//
//   const query = 'What is RAG?';
//   const results = await retriever.retrieve(query);
//   console.log(`Results for "${query}":`, results);
//   console.log('Formatted Context:', retriever.formatContext(results));
// }
//
// testRetriever();
