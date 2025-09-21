// Fix collection dimensions script
/** biome-ignore-all lint/style/noNonNullAssertion: Environment variables are validated at runtime */
import { DataAPIClient } from "@datastax/astra-db-ts";
import { ASTRA_DB_API_ENDPOINT, ASTRA_DB_APPLICATION_TOKEN, ASTRA_DB_NAMESPACE, ASTRA_DB_COLLECTION, OPENAI_EMBEDDING_MODEL_NAME } from "../constants";

// Initialize DataStax Astra DB client
const client = new DataAPIClient(ASTRA_DB_APPLICATION_TOKEN!);
const db = client.db(ASTRA_DB_API_ENDPOINT!, {
  keyspace: ASTRA_DB_NAMESPACE!,
});

// Get the correct dimensions based on the embedding model
function getEmbeddingDimensions(modelName: string): number {
  switch (modelName) {
    case 'text-embedding-ada-002':
    case 'text-embedding-3-small':
      return 1536;
    case 'text-embedding-3-large':
      return 3072;
    default:
      console.warn(`Unknown embedding model: ${modelName}. Defaulting to 1536 dimensions.`);
      return 1536;
  }
}

async function fixCollection() {
  const embeddingModel = OPENAI_EMBEDDING_MODEL_NAME || 'text-embedding-3-small';
  const correctDimensions = getEmbeddingDimensions(embeddingModel);
  
  console.log(`Current embedding model: ${embeddingModel}`);
  console.log(`Expected dimensions: ${correctDimensions}`);
  console.log(`Collection: ${ASTRA_DB_COLLECTION}`);
  
  try {
    // Step 1: Delete the existing collection
    console.log(`\nDeleting existing collection: ${ASTRA_DB_COLLECTION}...`);
    await db.dropCollection(ASTRA_DB_COLLECTION!);
    console.log('Collection deleted successfully.');
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('does not exist')) {
      console.log('Collection does not exist, no need to delete.');
    } else {
      console.warn('Could not delete collection:', errorMessage);
    }
  }

  try {
    // Step 2: Create the collection with correct dimensions
    console.log(`\nCreating collection with ${correctDimensions} dimensions...`);
    const result = await db.createCollection(ASTRA_DB_COLLECTION!, {
      vector: {
        dimension: correctDimensions,
        metric: 'cosine',
      },
    });
    console.log('Collection created successfully:', result);
    console.log(`\n✅ Collection '${ASTRA_DB_COLLECTION}' is now configured for ${embeddingModel} (${correctDimensions} dimensions)`);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Failed to create collection:', errorMessage);
    process.exit(1);
  }
}

// Run the fix
fixCollection().catch(error => {
  console.error('Error fixing collection:', error);
  process.exit(1);
});
