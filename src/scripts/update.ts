// update the database with more urls
import "dotenv/config";
import { DataAPIClient, Collection } from "@datastax/astra-db-ts";
import OpenAI from "openai";
import { PuppeteerWebBaseLoader } from "@langchain/community/document_loaders/web/puppeteer";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter"; // LangChain component for splitting text into chunks
import { getUrlsToProcess } from "../utils/url-loader";

// --- Environment Variable Setup ---
const { 
  ASTRA_DB_API_ENDPOINT,
  ASTRA_DB_APPLICATION_TOKEN,
  ASTRA_DB_NAMESPACE,
  ASTRA_DB_COLLECTION,
  OPENAI_API_KEY,
} = process.env;

if (
  !ASTRA_DB_API_ENDPOINT ||
  !ASTRA_DB_APPLICATION_TOKEN ||
  !ASTRA_DB_NAMESPACE ||
  !ASTRA_DB_COLLECTION ||
  !OPENAI_API_KEY
) {
  throw new Error(
    "Missing one or more required environment variables for database update."
  );
}

// --- Client Initialization ---
const openaiClient = new OpenAI({ apiKey: OPENAI_API_KEY });
const dbClient = new DataAPIClient(ASTRA_DB_APPLICATION_TOKEN);
const db = dbClient.db(ASTRA_DB_API_ENDPOINT);
let astraCollection: Collection;

// --- Helper Functions ---
/**
 * Scrapes a webpage and returns its cleaned text content.
 * @param url The URL of the page to scrape.
 * @returns Promise<string | undefined> The cleaned text content or undefined if scraping fails.
 */
const scrapePage = async (url: string): Promise<string | undefined> => {
  console.log(`Scraping: ${url}`);
  try {
    const loader = new PuppeteerWebBaseLoader(url, {
      launchOptions: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'], // Added for compatibility in some environments
      },
      gotoOptions: {
        waitUntil: "domcontentloaded",
      },
      async evaluate(page, browser) {
        const result = await page.evaluate(() => document.body.innerHTML);
        await browser.close();
        return result;
      },
    });
    const docs = await loader.load();
    return docs[0]?.pageContent.replace(/<[^>]*>/g, "").replace(/\s+/g, ' ').trim(); // Clean HTML and extra whitespace
  } catch (error) {
    console.error(`Error scraping ${url}:`, error);
    return undefined;
  }
};

/**
 * Splits text into chunks for embedding.
 * @param text The text to split.
 * @returns Promise<string[]> An array of text chunks.
 */
const splitText = async (text: string): Promise<string[]> => {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1024, // Aim for chunks of this many characters
    chunkOverlap: 256,  // Overlap chunks to maintain context
  });
  return splitter.splitText(text);
};

// --- Core Database Update Logic ---
/**
 * Updates the Astra DB collection with content from the given URLs.
 * @param urls An array of URLs to process.
 */
const updateDatabase = async (urls: string[]) => {
  if (!astraCollection) {
    console.log(`Connecting to collection: ${ASTRA_DB_COLLECTION} in keyspace: ${ASTRA_DB_NAMESPACE}`);
    astraCollection = await db.collection(ASTRA_DB_COLLECTION, {
        keyspace: ASTRA_DB_NAMESPACE,
    });
    console.log("Connected to collection.");
  }

  for (const url of urls) {
    console.log(`\nProcessing URL: ${url}`);
    const rawText = await scrapePage(url);

    if (!rawText) {
      console.warn(`Skipping URL due to scraping error: ${url}`);
      continue;
    }

    console.log(`Text scraped successfully. Length: ${rawText.length}`);
    const chunks = await splitText(rawText);
    console.log(`Text split into ${chunks.length} chunks.`);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      try {
        console.log(`Generating embedding for chunk ${i + 1}/${chunks.length}...`);
        const embeddingResponse = await openaiClient.embeddings.create({
          model: "text-embedding-3-small",
          input: chunk,
        });
        const embedding = embeddingResponse.data[0].embedding;

        const documentToStore = {
          text: chunk,
          url: url,
          $vector: embedding,
        };

        console.log(`Inserting chunk ${i + 1} into Astra DB...`);
        const { insertedId } = await astraCollection.insertOne(documentToStore);
        console.log(`Successfully inserted chunk ${i + 1} with ID: ${insertedId}`);

      } catch (embeddingError) {
        console.error(`Error processing chunk ${i + 1} for URL ${url}:`, embeddingError);
      }
      // Optional: Add a small delay to avoid rate limiting if processing many chunks rapidly
      // await new Promise(resolve => setTimeout(resolve, 200)); 
    }
    console.log(`Finished processing URL: ${url}`);
  }
  console.log("\nDatabase update process completed for all URLs.");
};

// --- Main Execution ---
async function main() {
  try {
    const urlsToUpdate = await getUrlsToProcess();
    console.log(`Loaded ${urlsToUpdate.length} URLs from link files...`);

    if (urlsToUpdate.length === 0) {
      console.warn("No URLs found in link files. Script will exit without processing.");
      return;
    }

    await updateDatabase(urlsToUpdate);
    console.log("Script finished successfully.");
  } catch (error) {
    console.error("An error occurred during the update process:", error);
    process.exit(1);
  }
}

main();