// src/vector-store.ts
import { RagDocument } from './data-loader';
import { DataAPIClient, Collection as AstraCollection } from '@datastax/astra-db-ts';

// --- Configuration Interfaces ---
export interface EmbeddingModel {
  name: string;
  dimensions?: number; // Optional: some stores need this explicitly
  generateEmbeddings(texts: string[]): Promise<number[][]>;
}

interface InMemoryStoreConfig {
  provider: 'in-memory';
}

interface AstraDBStoreConfig {
  provider: 'datastax_astra';
  token: string;
  endpoint: string;
  collectionName: string;
  keyspace: string; // Updated from namespace
  embeddingDimension: number; // Required for collection creation/validation
}

// Add other provider configs here (Pinecone, ChromaDB, etc.)
// interface PineconeStoreConfig { provider: 'pinecone'; apiKey: string; environment: string; indexName: string; }

export type VectorStoreConfig = InMemoryStoreConfig | AstraDBStoreConfig; // Add other configs to this union

// --- Placeholder Embedding Model (for internal use or if no model is passed) ---
// This should ideally be replaced by passing a concrete EmbeddingModel instance to VectorStore.
class PlaceholderEmbeddingModel implements EmbeddingModel {
  name = 'text-embedding-3-small';
  dimensions = 1536; // Default dimension

  constructor(apiKey?: string) { // apiKey is not used by placeholder but kept for signature compatibility if needed
    if (apiKey) {
      console.warn(
        'PlaceholderEmbeddingModel received an API key, but it does not use it. '
        + 'Ensure a proper EmbeddingModel is configured for real embeddings.'
      );
    }
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    console.warn(`Using PlaceholderEmbeddingModel to generate dummy embeddings for ${texts.length} texts.`);
    return texts.map(text => Array(this.dimensions).fill(0).map(() => Math.random()));
  }
}

// --- VectorStore Class ---

export class VectorStore {
  private config: VectorStoreConfig;
  private embeddingModel: EmbeddingModel;

  // For In-Memory Store
  private inMemoryStore?: Map<string, RagDocument>;

  // For AstraDB Store
  private astraClient?: DataAPIClient;
  private astraCollection?: AstraCollection;

  constructor(config: VectorStoreConfig, embeddingModel?: EmbeddingModel) {
    this.config = config;
    this.embeddingModel = embeddingModel || new PlaceholderEmbeddingModel();

    console.log(`VectorStore initializing for provider: ${config.provider}...`);

    switch (config.provider) {
      case 'in-memory':
        this.inMemoryStore = new Map();
        console.log('In-memory vector store initialized.');
        break;
      case 'datastax_astra':
        try {
          this.astraClient = new DataAPIClient(config.token);
          const db = this.astraClient.db(config.endpoint, { keyspace: config.keyspace });
          this.astraCollection = db.collection(config.collectionName);
          console.log(`AstraDB vector store initialized for collection: ${config.collectionName}`);
          // Optionally, verify collection or create if not exists (can be complex, e.g., checking dimensions)
          // this.ensureAstraCollectionExists(config);
        } catch (error) {
          console.error('Failed to initialize AstraDB client:', error);
          throw new Error(`AstraDB client initialization failed: ${error instanceof Error ? error.message : String(error)}`);
        }
        break;
      // Add cases for other providers (Pinecone, ChromaDB, etc.)
      default: {
        const _exhaustiveCheck: never = config;
        throw new Error(`Unsupported vector store provider: ${(_exhaustiveCheck as any).provider}`);
      }
    }
    console.log('VectorStore initialization complete.');
  }

  // Helper to ensure Astra collection exists (optional, can be called explicitly)
  private async ensureAstraCollectionExists(config: AstraDBStoreConfig): Promise<void> {
    if (!this.astraCollection || !this.astraClient) {
      throw new Error('AstraDB client not initialized for ensureAstraCollectionExists.');
    }
    try {
      // Check if collection exists - DataAPIClient might not have a direct `listCollections` or `describeCollection`.
      // A common pattern is to try a read or write and handle errors, or assume it's pre-created.
      // For robust creation, one might need to use astra-db-ts's admin capabilities if available,
      // or simply attempt to create it and catch 'already exists' errors.
      console.log(`Attempting to create AstraDB collection '${config.collectionName}' if not exists (dimension: ${config.embeddingDimension})...`);
      await this.astraClient.db(config.endpoint, { keyspace: config.keyspace }).createCollection(config.collectionName, {
        vector: {
          dimension: config.embeddingDimension,
          metric: 'cosine', // Or make this configurable
        },
      });
      console.log(`AstraDB collection '${config.collectionName}' ensured/created.`);
    } catch (e: any) {
      // It's common for createCollection to throw an error if it already exists with a compatible or incompatible schema.
      // Error messages/codes from AstraDB would need to be inspected to differentiate.
      if (e.message && (e.message.includes('already exists') || e.message.includes('E11000 duplicate key error'))) {
        console.log(`AstraDB collection '${config.collectionName}' already exists.`);
        // Here you might want to verify if the existing collection's dimension matches config.embeddingDimension.
        // This is a more advanced check and might require specific AstraDB API calls not directly in DataAPIClient's basic ops.
      } else {
        console.error(`Error ensuring/creating AstraDB collection '${config.collectionName}':`, e);
        throw e; // Re-throw if it's not an 'already exists' type of error
      }
    }
  }

  /**
   * Adds documents to the vector store. If embeddings are not present, generates them.
   * @param documents Document[]
   * @param embeddingModelName Optional: name of the embedding model to use if not pre-embedded.
   * @returns Promise<void>
   */
  async addDocuments(documents: RagDocument[]): Promise<void> {
    if (documents.length === 0) return;
    console.log(`Adding ${documents.length} documents to ${this.config.provider} store...`);

    const docsToEmbed = documents.filter(doc => !doc.embedding && doc.content);
    if (docsToEmbed.length > 0) {
      console.log(`Generating embeddings for ${docsToEmbed.length} documents using ${this.embeddingModel.name}...`);
      const contents = docsToEmbed.map(doc => doc.content);
      const embeddings = await this.embeddingModel.generateEmbeddings(contents);
      docsToEmbed.forEach((doc, index) => {
        doc.embedding = embeddings[index];
      });
    }

    for (const doc of documents) {
      if (!doc.embedding) {
        console.warn(`Document ID ${doc.id} is missing content or failed to generate embedding. Skipping.`);
        continue;
      }
    }

    switch (this.config.provider) {
      case 'in-memory':
        if (!this.inMemoryStore) throw new Error('In-memory store not initialized.');
        for (const doc of documents) {
          if (doc.embedding) this.inMemoryStore.set(doc.id, doc);
        }
        break;
      case 'datastax_astra': {
        if (!this.astraCollection) throw new Error('AstraDB collection not initialized.');
        const astraDocs = documents
          .filter(doc => doc.embedding) // Ensure embedding exists
          .map(doc => ({
            _id: doc.id, // AstraDB uses _id by default
            text: doc.content,
            $vector: doc.embedding,
            ...(doc.metadata && { metadata: doc.metadata }), // Spread metadata if it exists
          }));
        if (astraDocs.length > 0) {
          // Consider batching for very large arrays of documents
          const result = await this.astraCollection.insertMany(astraDocs);
          console.log(`Inserted ${result.insertedCount} documents into AstraDB. IDs: ${JSON.stringify(result.insertedIds)}`);
        } else {
          console.log('No documents with embeddings to insert into AstraDB.');
        }
        break;
      }
      default: {
        const _exhaustiveCheck: never = this.config;
        throw new Error(`Unsupported provider for addDocuments: ${(_exhaustiveCheck as any).provider}`);
      }
    }
    console.log(`${documents.length} documents processed for addition.`);
  }

  /**
   * Performs a similarity search against the vector store.
   * @param queryEmbedding number[] The vector embedding of the query.
   * @param topK number The number of top results to return.
   * @returns Promise<Document[]>
   */
  async similaritySearch(queryEmbedding: number[], topK: number): Promise<RagDocument[]> {
    console.log(`Performing similarity search in ${this.config.provider} store for top ${topK} results...`);

    switch (this.config.provider) {
      case 'in-memory': {
        if (!this.inMemoryStore) throw new Error('In-memory store not initialized.');
        // Basic in-memory search (can be improved with actual cosine similarity)
        const allDocs = Array.from(this.inMemoryStore.values());
        // This is a placeholder: real in-memory search needs cosine similarity calculation and sorting.
        // For now, it just returns the first topK docs like the original placeholder.
        console.warn('In-memory similarity search is using placeholder logic (returns first K docs).');
        return allDocs.slice(0, topK);
      }

      case 'datastax_astra': {
        if (!this.astraCollection) throw new Error('AstraDB collection not initialized.');
        try {
          // Use vector search with explicit $vectorize parameter
          const cursor = this.astraCollection.find(
            {},
            {
              sort: { $vector: queryEmbedding },
              limit: topK,
              includeSimilarity: true, // Include similarity scores in results
            },
          );

          const astraResults = await cursor.toArray();
          console.log(`Retrieved ${astraResults.length} documents from AstraDB`);

          // Debug the retrieved document IDs
          if (astraResults.length > 0) {
            console.log('Retrieved document IDs:', astraResults.map(doc => doc._id));
          }

          return astraResults.map((astraDoc: any) => ({
            id: astraDoc._id as string,
            content: astraDoc.text as string,
            embedding: astraDoc.$vector as number[] | undefined,
            metadata: astraDoc.metadata as Record<string, any> | undefined,
            similarity: astraDoc.$similarity as number | undefined,
          }));
        } catch (error) {
          console.error('Error during AstraDB similarity search:', error);
          throw error;
        }
      }

      default: {
        const _exhaustiveCheck: never = this.config;
        throw new Error(`Unsupported provider for similaritySearch: ${(_exhaustiveCheck as any).provider}`);
      }
    }
  }

  // Add other methods like:
  // - deleteDocuments(documentIds: string[]): Promise<void>
  // - updateDocuments(documents: Document[]): Promise<void>
  // - getCollectionStats(): Promise<any>
}

// Example Usage (for testing)
/*
async function testVectorStore() {
  const docs: RagDocument[] = [
    { id: 'd1', content: 'Formula 1 is a sport.' },
    { id: 'd2', content: 'Max Verstappen won the championship in 2023.' },
  ];

  const vs = new VectorStore({ provider: 'in-memory' }, 'your-openai-api-key');
  await vs.addDocuments(docs);

  const queryEmbeddingModel = new OpenAIEmbeddingModel('your-openai-api-key');
  const [queryEmbedding] = await queryEmbeddingModel.generateEmbeddings(['Who won F1 in 2023?']);
  
  const searchResults = await vs.similaritySearch(queryEmbedding, 1);
  console.log('Search Results:', searchResults);
}

testVectorStore();
*/
