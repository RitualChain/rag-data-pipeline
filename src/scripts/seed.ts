// Import necessary modules
/** biome-ignore-all lint/style/noNonNullAssertion: <explanation> */
import OpenAI from "openai"; // OpenAI SDK for generating embeddings
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter"; // LangChain component for splitting text into chunks
import { DataAPIClient } from "@datastax/astra-db-ts"; // DataStax Astra DB client
import { PuppeteerWebBaseLoader } from "@langchain/community/document_loaders/web/puppeteer"; // LangChain loader for scraping web pages using Puppeteer
import { ASTRA_DB_API_ENDPOINT, ASTRA_DB_APPLICATION_TOKEN, ASTRA_DB_NAMESPACE, ASTRA_DB_COLLECTION, OPENAI_API_KEY, OPENAI_EMBEDDING_MODEL_NAME } from "../constants";
import { getUrlsToProcess } from "../utils/url-loader";

// Define the type for similarity metric used in vector search
type SimilarityMetric = "cosine" | "euclidean" | "dot_product";

// Initialize OpenAI client
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// Initialize DataStax Astra DB client
const client = new DataAPIClient(ASTRA_DB_APPLICATION_TOKEN); // Use '!' if you are sure the token is always present
const db = client.db(ASTRA_DB_API_ENDPOINT!, {
  keyspace: ASTRA_DB_NAMESPACE!, // Specify the namespace (keyspace)
});

// Initialize LangChain's text splitter
const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 512,    // Maximum size of each chunk
  chunkOverlap: 128, // Number of characters to overlap between chunks
});

/**
 * Creates a new collection in Astra DB if it doesn't already exist.
 * Configures the collection for vector search with a specified dimension and similarity metric.
 * @param similarityMetric The similarity metric to use for vector search (default: "dot_product").
 */
const createCollection = async (
  similarityMetric: SimilarityMetric = "dot_product"
) => {
  try {
    const res = await db.createCollection(ASTRA_DB_COLLECTION!, {
      vector: {
        dimension: 1536, // Dimension of OpenAI's text-embedding-3-small model
        metric: similarityMetric,
      },
    });
    console.log('Create collection result:', res);
  } catch (e) {
    // Log error if collection already exists or another issue occurs
    if (e instanceof Error) {
      console.log(`Collection '${ASTRA_DB_COLLECTION}' already exists or another error occurred: ${e.message}`);
    } else {
      console.log(`Collection '${ASTRA_DB_COLLECTION}' already exists or an unknown error occurred:`, e);
    }
  }
}

/**
 * Scrapes the content of a given URL using PuppeteerWebBaseLoader.
 * Extracts the inner HTML of the body and removes HTML tags.
 * @param url The URL of the web page to scrape.
 * @returns The cleaned text content of the page, or an empty string if scraping fails.
 */
const scrapePage = async (url: string): Promise<string> => {
  console.log(`Scraping page: ${url}`);
  const loader = new PuppeteerWebBaseLoader(url, {
    launchOptions: {
      headless: true, // Run Puppeteer in headless mode (no UI)
    },
    gotoOptions: {
      waitUntil: "domcontentloaded", // Wait until the DOM is fully loaded
    },
    /**
     * Custom evaluate function to extract the body's innerHTML.
     * This function runs in the browser context.
     */
    evaluate: async (page, browser) => {
      const result = await page.evaluate(() => document.body.innerHTML);
      await browser.close(); // Close the browser instance after scraping
      return result;
    },
  });
  const scrapedContent = await loader.scrape();
  // Remove HTML tags from the scraped content
  return scrapedContent?.replace(/<[^>]*>/g, "") || "";
};

/**
 * Loads data from the specified URLs, processes it, and stores it in Astra DB.
 * - Scrapes web pages.
 * - Splits content into chunks.
 * - Generates embeddings for each chunk using OpenAI.
 * - Inserts the chunks and their embeddings into the Astra DB collection.
 */
const loadSampleData = async () => {
  const collection = db.collection(ASTRA_DB_COLLECTION!);
  console.log(`Loading data into collection: ${ASTRA_DB_COLLECTION}`);

  // Get URLs from files instead of environment variable
  const docsData = await getUrlsToProcess();
  console.log(`Processing ${docsData.length} URLs from link files...`);

  for await (const url of docsData) {
    const content = await scrapePage(url);
    if (!content) {
      console.log(`No content scraped from ${url}, skipping.`);
      continue;
    }

    const chunks = await splitter.splitText(content);
    console.log(`Split content from ${url} into ${chunks.length} chunks.`);

    for await (const chunk of chunks) {
      // Generate embedding for the current chunk
      const embedding = await openai.embeddings.create({
        model: "text-embedding-3-small", // OpenAI embedding model
        input: chunk,
        encoding_format: "float", // Specify float encoding for embeddings
      });
      
      const vector = embedding.data[0].embedding;

      // Insert the chunk and its vector embedding into the collection
      const res = await collection.insertOne({
        $vector: vector, // The vector embedding
        text: chunk,     // The original text chunk
      });
      console.log('Inserted document result:', res);
    }
  }
  console.log('Sample data loading complete.');
};

// Main execution flow: Create the collection, then load the sample data.
createCollection().then(() => {
  console.log('Collection creation/verification complete. Starting data load...');
  loadSampleData();
}).catch(error => {
  console.error('An error occurred during the seeding process:', error);
});
