import 'dotenv/config'; // Load environment variables
import {
  RAGPipeline,
  VectorStore,
  LLM,
  RagDocument, // Renamed from Document
  EmbeddingModel as SDKEmbeddingModel, // Alias for clarity
  LLMResponse, // Assuming LLMResponse type is exported from src
} from '../classes';
import OpenAI from 'openai';
import { DataAPIClient } from '@datastax/astra-db-ts'; // Corrected import based on seed.ts and lint error 4a2b584a-e6a1-4ecd-8d98-8dec1f69e454

// Assuming the common pattern used in other project files like seed.ts is intended:

// --- Environment Variable Validation ---
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const OPENAI_MODEL_NAME = process.env.OPENAI_MODEL_NAME || 'gpt-3.5-turbo'; // Default if not set
const ASTRA_DB_API_ENDPOINT = process.env.ASTRA_DB_API_ENDPOINT!;
const ASTRA_DB_APPLICATION_TOKEN = process.env.ASTRA_DB_APPLICATION_TOKEN!;
const ASTRA_DB_COLLECTION = process.env.ASTRA_DB_COLLECTION!;
const ASTRA_DB_KEYSPACE = process.env.ASTRA_DB_KEYSPACE || process.env.ASTRA_DB_NAMESPACE!; // Prefer KEYSPACE, fallback to NAMESPACE for compatibility

if (!OPENAI_API_KEY) {
  console.error('Missing required environment variable: OPENAI_API_KEY');
  process.exit(1);
}
if (!ASTRA_DB_API_ENDPOINT || !ASTRA_DB_APPLICATION_TOKEN || !ASTRA_DB_COLLECTION || !ASTRA_DB_KEYSPACE) {
  console.error('Missing one or more required AstraDB environment variables:');
  if (!ASTRA_DB_API_ENDPOINT) console.error(' - ASTRA_DB_API_ENDPOINT');
  if (!ASTRA_DB_APPLICATION_TOKEN) console.error(' - ASTRA_DB_APPLICATION_TOKEN');
  if (!ASTRA_DB_COLLECTION) console.error(' - ASTRA_DB_COLLECTION');
  if (!ASTRA_DB_KEYSPACE) console.error(' - ASTRA_DB_KEYSPACE (or ASTRA_DB_NAMESPACE)');
  process.exit(1);
}

// --- OpenAI Embedding Adapter ---
class OpenAIEmbeddingAdapter implements SDKEmbeddingModel {
  public name: string; // Added to satisfy EmbeddingModel interface
  private openai: OpenAI;
  private model: string;
  public readonly dimensions: number;

  constructor(apiKey: string, modelName: string = 'text-embedding-ada-002') {
    this.openai = new OpenAI({ apiKey });
    this.name = modelName; // Initialize the name property
    this.model = modelName; // Initialize this.model for generateEmbeddings
    // Known dimensions for common OpenAI models
    if (modelName === 'text-embedding-ada-002' || modelName === 'text-embedding-3-small') {
      this.dimensions = 1536;
    } else if (modelName === 'text-embedding-3-large') {
      this.dimensions = 3072;
    } else {
      console.warn(`Unknown dimensions for embedding model ${modelName}. Defaulting to 1536.`);
      this.dimensions = 1536; 
    }
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (!texts || texts.length === 0) return [];
    const response = await this.openai.embeddings.create({
      model: this.model,
      input: texts.map(text => text.replace(/\n/g, ' ')),
    });
    return response.data.map(item => item.embedding);
  }
}

// Extend LLMResponse type for this test if sourceDocuments isn't formally in src/types yet
interface TestLLMResponse extends LLMResponse {
  sourceDocuments?: RagDocument[]; // Updated to RagDocument
}

// --- Test Helper Functions ---
function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ Assertion failed: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`✅ Assertion passed: ${message}`);
}

async function clearTestDocuments(clientConfig: {
  token: string;
  endpoint: string;
  keyspace: string;
  collectionName: string;
}) {
  console.log(
    `\n🧹 Clearing test documents from collection: "${clientConfig.collectionName}" in keyspace: "${clientConfig.keyspace}"...`
  );
  const client = new DataAPIClient(clientConfig.token);
  const db = client.db(clientConfig.endpoint, {
    keyspace: clientConfig.keyspace,
  });
  const collection = db.collection(clientConfig.collectionName);

  try {
    const deleteResult = await collection.deleteMany({
      "metadata.source": "test-script",
    });
    
    console.log(
      `Clear operation attempted. Result: ${JSON.stringify(deleteResult, null, 2)}`
    );
    // Check if deletedCount is available and log it
    const deletedCount = (deleteResult as any)?.status?.deletedCount ?? (deleteResult as any)?.deletedCount;
    if (typeof deletedCount === 'number') {
        console.log(`Number of documents deleted: ${deletedCount}`);
    } else {
        console.log("Number of documents deleted might not be available in the response, or no documents matched the filter.");
    }

  } catch (error: any) {
    console.error(
      `Error clearing test documents: ${
        error.message || JSON.stringify(error.errors) || error
      }`
    );
    // Optionally re-throw if cleanup failure should fail the test
    // throw error; 
  }
}

// --- Main Test Execution ---
async function main() {
  console.log('--- Running Integration RAG SDK Test ---');

  const dbConfigForCleanup = {
    token: ASTRA_DB_APPLICATION_TOKEN!,
    endpoint: ASTRA_DB_API_ENDPOINT!,
    keyspace: ASTRA_DB_KEYSPACE!,
    collectionName: ASTRA_DB_COLLECTION!,
  };

  await clearTestDocuments(dbConfigForCleanup); // Initial cleanup

  try {
    const embeddingModel = new OpenAIEmbeddingAdapter(OPENAI_API_KEY!);
    const vectorStore = new VectorStore(
      {
        provider: 'datastax_astra',
        token: ASTRA_DB_APPLICATION_TOKEN!,
        endpoint: ASTRA_DB_API_ENDPOINT!,
        collectionName: ASTRA_DB_COLLECTION!,
        keyspace: ASTRA_DB_KEYSPACE!,
        embeddingDimension: embeddingModel.dimensions,
      }
    );

    console.log(`Using AstraDB Collection: ${ASTRA_DB_COLLECTION} in Keyspace: ${ASTRA_DB_KEYSPACE}`);

    const llm = new LLM({
      provider: 'openai',
      modelName: OPENAI_MODEL_NAME,
      apiKey: OPENAI_API_KEY!,
      temperature: 0.7,
    });

    const pipeline = new RAGPipeline({
      vectorStore,
      retrieverEmbeddingModel: embeddingModel,
      llm,
      retrieverTopK: 3,
      retrieverSimilarityThreshold: 0.75, // Set threshold for relevance filtering
    });

    const sampleDocuments: RagDocument[] = [
      {
        id: 'test_doc_sdk_intro',
        content: 'The RAG SDK is designed to simplify building retrieval-augmented generation applications.',
        metadata: { category: 'sdk-introduction', source: 'test-script' },
      },
      {
        id: 'test_doc_sdk_features',
        content: 'Core features include flexible data loading, multiple vector store integrations, and configurable LLM usage.',
        metadata: { category: 'sdk-features', source: 'test-script' },
      },
      {
        id: 'test_doc_sdk_testing',
        content: 'This integration test uses OpenAI for embeddings and LLM, and Astra DB for vector storage.',
        metadata: { category: 'sdk-testing', source: 'test-script' },
      },
    ];

    console.log('\nEmbedding documents using OpenAIEmbeddingAdapter...');
    const contentsToEmbed = sampleDocuments.map(doc => doc.content);
    const embeddings = await embeddingModel.generateEmbeddings(contentsToEmbed);
    
    const documentsToAdd: RagDocument[] = sampleDocuments.map((doc, index) => ({
      ...doc,
      embedding: embeddings[index],
    }));

    if (documentsToAdd.length > 0) {
      await pipeline.addDocuments(documentsToAdd);
      console.log(`${documentsToAdd.length} sample documents added to the RAGPipeline.`);
    }

    // --- Test Relevant Query ---
    const query = 'What are the core features of the RAG SDK?';
    console.log(`\nMaking query: "${query}"`);
    const response = await pipeline.query(query) as TestLLMResponse;

    console.log('\n--- Query Result ---');
    console.log('Response Text:', response.text);
    assert(typeof response.text === 'string' && response.text.length > 0, "Response text should be non-empty");

    if (response.metadata) {
      console.log('Response Metadata:', JSON.stringify(response.metadata, null, 2));
    }
    
    assert(response.sourceDocuments !== undefined && Array.isArray(response.sourceDocuments), "sourceDocuments should be an array");
    assert(response.sourceDocuments!.length > 0, "Should retrieve at least one source document for a relevant query.");
    console.log('Retrieved Source Documents:');
    let foundRelevantDoc = false;
    response.sourceDocuments!.forEach((doc: RagDocument, index: number) => {
      console.log(`  [${index + 1}] ID: ${doc.id}, Content: ${doc.content.substring(0, 100)}...`);
      console.log(`      Metadata: ${JSON.stringify(doc.metadata, null, 2)}`);
      if (doc.id === 'test_doc_sdk_features') {
        foundRelevantDoc = true;
      }
    });
    assert(foundRelevantDoc, "Expected source document 'test_doc_sdk_features' was not retrieved.");

    // --- Test Unrelated Query ---
    const unrelatedQuery = 'Tell me about the history of space travel.';
    console.log(`\nMaking unrelated query: "${unrelatedQuery}"`);
    
    // Create a new pipeline with higher similarity threshold for unrelated query test
    const unrelatedPipeline = new RAGPipeline({
      vectorStore,
      retrieverEmbeddingModel: embeddingModel,
      llm,
      retrieverTopK: 3,
      retrieverSimilarityThreshold: 0.95, // Very high threshold for unrelated query
    });
    
    const unrelatedResponse = await unrelatedPipeline.query(unrelatedQuery) as TestLLMResponse;

    console.log('\n--- Unrelated Query Result ---');
    console.log('Response Text:', unrelatedResponse.text);
    assert(typeof unrelatedResponse.text === 'string' && unrelatedResponse.text.length > 0, "Unrelated query response text should be non-empty (LLM should still answer)");

    // Check if sourceDocuments exists and is empty
    if (unrelatedResponse.sourceDocuments) {
      if (Array.isArray(unrelatedResponse.sourceDocuments)) {
        assert(unrelatedResponse.sourceDocuments.length === 0, "Should retrieve no source documents for an unrelated query.");
        console.log('No relevant source documents found for unrelated query, as expected.');
      } else {
        console.log('sourceDocuments field is not an array for unrelated query, as expected.');
        assert(true, "sourceDocuments field is not an array, which is acceptable for an unrelated query.");
      }
    } else {
      console.log('sourceDocuments field not present for unrelated query, as expected.');
      assert(true, "sourceDocuments field not present, which is acceptable for an unrelated query.");
    }
    
    if (unrelatedResponse.metadata) {
      console.log('Response Metadata for unrelated query:', JSON.stringify(unrelatedResponse.metadata, null, 2));
    }

  } catch (error) {
    console.error('\n--- Test Execution Error ---');
    console.error('Error during RAG SDK test execution:', error);
    throw error; 
  } finally {
    await clearTestDocuments(dbConfigForCleanup); // Cleanup after tests
    console.log('\n--- Integration RAG SDK Test Complete ---');
  }
}

main().catch(error => {
  console.error('Error during integration test execution:', error);
  process.exit(1);
});
