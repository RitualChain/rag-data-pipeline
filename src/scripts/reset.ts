// // scripts/reset.ts
// /** biome-ignore-all lint/style/noNonNullAssertion: <explanation> */

// import axios from 'axios';
// import { JSDOM } from 'jsdom';
// import OpenAI from 'openai';
// import type { EmbeddingModel, VectorStoreConfig, RagDocument } from '../classes'; // Adjust path as needed
// import { VectorStore } from '../classes'; // Adjust path as needed
// import { ASTRA_DB_API_ENDPOINT, ASTRA_DB_APPLICATION_TOKEN, ASTRA_DB_COLLECTION, ASTRA_DB_NAMESPACE, OPENAI_API_KEY, OPENAI_EMBEDDING_MODEL_NAME } from '../constants';
// import { DataAPIClient } from '@datastax/astra-db-ts';
// import { getUrlsToProcess } from '../utils/url-loader';

// // Validate essential environment variables
// if (!OPENAI_API_KEY) {
//   console.error('Error: OPENAI_API_KEY environment variable is missing or empty.');
//   process.exit(1);
// }

// // Initialize OpenAI client
// const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// // --- OpenAI Embedding Adapter --- 
// // (Similar to the one in scripts/test.ts or could be imported if centralized)
// class OpenAIEmbeddingAdapter implements EmbeddingModel {
//   private openai: OpenAI;
//   public dimensions: number;
//   public modelName: string;
//   public name: string; // Added to satisfy EmbeddingModel interface

//   constructor(apiKey: string, modelName: string = OPENAI_EMBEDDING_MODEL_NAME!) {
//     this.openai = openai;
//     this.modelName = modelName;
//     this.name = modelName; // Initialize the name property
//     // Known dimensions for common OpenAI models (this might need to be fetched or configured)
//     // For 'text-embedding-ada-002', it's 1536
//     // For 'text-embedding-3-small', it's 1536
//     // For 'text-embedding-3-large', it's 3072
//     // Adjust this based on the modelName
//     if (modelName === 'text-embedding-ada-002' || modelName === 'text-embedding-3-small') {
//       this.dimensions = 1536;
//     } else if (modelName === 'text-embedding-3-large') {
//       this.dimensions = 3072;
//     } else {
//       console.warn(`Unknown dimensions for embedding model ${modelName}. Defaulting to 1536. Please verify.`);
//       this.dimensions = 1536; // Default for text-embedding-3-small
//     }
//   }

//   async generateEmbeddings(texts: string[]): Promise<number[][]> {
//     const BATCH_SIZE = 100; // Number of texts to process in each API call
//     const allEmbeddings: number[][] = [];
//     console.log(`Total texts to embed: ${texts.length}, using batch size: ${BATCH_SIZE}`);

//     for (let i = 0; i < texts.length; i += BATCH_SIZE) {
//       const batchTextsRaw = texts.slice(i, i + BATCH_SIZE);
//       // OpenAI recommends replacing newlines for better embedding quality
//       const batchTexts = batchTextsRaw.map(text => text.replace(/\n/g, ' '));
//       console.log(`Processing batch: ${i / BATCH_SIZE + 1} / ${Math.ceil(texts.length / BATCH_SIZE)}, size: ${batchTexts.length}`);
//       try {
//         const response = await this.openai.embeddings.create({
//           model: this.modelName,
//           input: batchTexts,
//         });
//         allEmbeddings.push(...response.data.map((embedding: any) => embedding.embedding));
//       } catch (error) {
//         console.error(`Error generating OpenAI embeddings for batch starting at index ${i}:`, error);
//         // Optionally, decide if you want to retry or collect partial results
//         throw error; // Re-throwing to stop the process if a batch fails for now
//       }
//     }
//     console.log(`Successfully generated embeddings for all ${texts.length} texts.`);
//     return allEmbeddings;
//   }
// }

// // --- Helper Functions ---

// async function fetchHtmlContent(url: string): Promise<string> {
//   try {
//     const response = await axios.get(url);
//     return response.data;
//   } catch (error) {
//     console.error(`Error fetching URL ${url}:`, error);
//     throw error;
//   }
// }

// function extractTextFromHtml(html: string): string {
//   const dom = new JSDOM(html);
//   const document = dom.window.document;
//   // Attempt to extract main content, fallback to body
//   const mainContent = document.querySelector('main') || document.querySelector('article') || document.body;
//   // Remove script and style tags
//   mainContent.querySelectorAll('script, style, nav, header, footer, aside').forEach(el => el.remove());
//   return mainContent.textContent?.replace(/\s\s+/g, ' ').trim() || '';
// }

// function chunkText(text: string, chunkSize: number = 1000, overlap: number = 200): string[] {
//   const chunks: string[] = [];
//   if (!text) return chunks;
//   for (let i = 0; i < text.length; i += (chunkSize - overlap)) {
//     chunks.push(text.substring(i, i + chunkSize));
//   }
//   return chunks;
// }

// // --- Main Script Logic ---

// async function main() {
//   console.log('--- Starting AstraDB Clearing and Re-seeding Script ---');
//   const openai = new OpenAI({ apiKey: OPENAI_API_KEY! });

//   // 1. Initialize Embedding Model
//   const embeddingModel = new OpenAIEmbeddingAdapter(openai.apiKey!, OPENAI_EMBEDDING_MODEL_NAME);
//   const embeddingDimension = embeddingModel.dimensions;
//   console.log(`Using OpenAI embedding model: ${OPENAI_EMBEDDING_MODEL_NAME} with dimension: ${embeddingDimension}`);

//   // 2. Initialize AstraDB Client
//   const astraClient = new DataAPIClient(ASTRA_DB_APPLICATION_TOKEN!);
//   const db = astraClient.db(ASTRA_DB_API_ENDPOINT!, { keyspace: ASTRA_DB_NAMESPACE! });
//   console.log(`Connected to AstraDB: ${ASTRA_DB_API_ENDPOINT}, Keyspace: ${ASTRA_DB_NAMESPACE}`);

//   // 3. Clear existing collection
//   try {
//     console.log(`Attempting to delete collection: ${ASTRA_DB_COLLECTION}...`);
//     await db.dropCollection(ASTRA_DB_COLLECTION!);
//     console.log(`Collection '${ASTRA_DB_COLLECTION}' deleted successfully.`);
//   } catch (error: any) {
//     if (error?.message?.includes('does not exist')) {
//       console.log(`Collection '${ASTRA_DB_COLLECTION}' does not exist, no need to delete.`);
//     } else {
//       console.warn(`Could not delete collection '${ASTRA_DB_COLLECTION}':`, error?.message || error);
//       // Decide if you want to proceed or exit. For a clear script, we might want to proceed.
//     }
//   }

//   // 4. Re-create the collection
//   try {
//     console.log(`Creating collection: ${ASTRA_DB_COLLECTION} with dimension ${embeddingDimension}...`);
//     await db.createCollection(ASTRA_DB_COLLECTION!, {
//       vector: {
//         dimension: embeddingDimension,
//         metric: 'cosine',
//       },
//       // checkExists option has been removed from the AstraDB client
//     });
//     console.log(`Collection '${ASTRA_DB_COLLECTION}' created successfully.`);
//   } catch (error: any) {
//     console.error(`Failed to create collection '${ASTRA_DB_COLLECTION}':`, error?.message || error);
//     process.exit(1); // Exit if collection creation fails
//   }

//   // 5. Initialize VectorStore from SDK
//   const vectorStoreConfig: VectorStoreConfig = {
//     provider: 'datastax_astra',
//     token: ASTRA_DB_APPLICATION_TOKEN!,
//     endpoint: ASTRA_DB_API_ENDPOINT!,
//     collectionName: ASTRA_DB_COLLECTION!,
//     keyspace: ASTRA_DB_NAMESPACE!,
//     embeddingDimension: embeddingDimension,
//   };
//   const vectorStore = new VectorStore(vectorStoreConfig, embeddingModel);
//   console.log('VectorStore initialized with AstraDB provider.');

//   // 6. Process URLs and prepare documents
//   const allDocuments: RagDocument[] = [];
//   const urlsToProcess = await getUrlsToProcess();
//   console.log(`\nProcessing ${urlsToProcess.length} URLs from link files...`);

//   for (const url of urlsToProcess) {
//     try {
//       console.log(`\nFetching content from: ${url}`);
//       const html = await fetchHtmlContent(url);
//       const text = extractTextFromHtml(html);
//       console.log(`Extracted text length: ${text.length} characters.`);

//       if (text.length < 50) { // Arbitrary threshold for meaningful content
//         console.warn(`Skipping URL ${url} due to very short extracted text.`);
//         continue;
//       }

//       const textChunks = chunkText(text, 1000, 200);
//       console.log(`Split into ${textChunks.length} chunks.`);

//       const documents: RagDocument[] = textChunks.map((chunk, index) => ({
//         id: `${url}#chunk${index}`,
//         content: chunk,
//         metadata: { source: url, chunkNumber: index + 1 },
//         // Embeddings will be generated by VectorStore.addDocuments
//       }));
//       allDocuments.push(...documents);
//       console.log(`Prepared ${documents.length} documents from ${url}.`);
//     } catch (error) {
//       console.error(`Failed to process URL ${url}:`, error);
//       // Continue with other URLs
//     }
//   }

//   // 7. Add documents to VectorStore (which will generate embeddings)
//   if (allDocuments.length > 0) {
//     console.log(`\nAdding ${allDocuments.length} documents to AstraDB via VectorStore...`);
//     try {
//       await vectorStore.addDocuments(allDocuments);
//       console.log(`${allDocuments.length} documents added successfully to collection '${ASTRA_DB_COLLECTION}'.`);
//     } catch (error) {
//       console.error('Error adding documents to VectorStore:', error);
//     }
//   } else {
//     console.log('No documents to add.');
//   }

//   console.log('\n--- AstraDB Clearing and Re-seeding Script Finished ---');
// }

// main().catch(error => {
//   console.error('Unhandled error in main script execution:', error);
//   process.exit(1);
// });