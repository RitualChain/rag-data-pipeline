// Script to scrape webpages and save them as files in a directory structure
/** biome-ignore-all lint/style/noNonNullAssertion: Environment variables are validated at runtime */
import fs from 'node:fs';
import path from 'node:path';
import { PuppeteerWebBaseLoader } from "@langchain/community/document_loaders/web/puppeteer";
import { getUrlsToProcess } from "../utils/url-loader";

// Configuration
const OUTPUT_DIR = path.join(process.cwd(), 'scraped-content');
const MAX_FILENAME_LENGTH = 100; // Maximum filename length to avoid filesystem issues

/**
 * Converts a URL to a safe file path structure
 * @param url The URL to convert
 * @returns Object with directory path and filename
 */
function urlToFilePath(url: string): { dirPath: string; fileName: string } {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    const pathname = urlObj.pathname;
    
    // Clean up the pathname to create a valid directory structure
    const pathParts = pathname
      .split('/')
      .filter(part => part.length > 0)
      .map(part => 
        // Replace invalid filename characters with underscores
        part.replace(/[<>:"/\\|?*]/g, '_')
            .replace(/\s+/g, '_')
            .toLowerCase()
      );
    
    // Create directory path: hostname/path/parts
    const dirPath = path.join(OUTPUT_DIR, hostname, ...pathParts.slice(0, -1));
    
    // Create filename from the last path part or use 'index' if empty
    let fileName = pathParts[pathParts.length - 1] || 'index';
    
    // Always use .md extension for Markdown output
    if (!fileName.includes('.')) {
      fileName += '.md';
    } else if (!fileName.endsWith('.md')) {
      // Replace any existing extension with .md
      const lastDotIndex = fileName.lastIndexOf('.');
      if (lastDotIndex > 0) {
        fileName = fileName.substring(0, lastDotIndex) + '.md';
      } else {
        fileName += '.md';
      }
    }
    
    // Truncate filename if too long
    if (fileName.length > MAX_FILENAME_LENGTH) {
      const ext = path.extname(fileName);
      const baseName = path.basename(fileName, ext);
      fileName = baseName.substring(0, MAX_FILENAME_LENGTH - ext.length - 3) + '...' + ext;
    }
    
    return { dirPath, fileName };
  } catch (error) {
    console.error(`Error parsing URL ${url}:`, error);
    // Fallback: create a safe filename from the full URL
    const safeUrl = url.replace(/[<>:"/\\|?*]/g, '_').replace(/https?:\/\//, '');
    return {
      dirPath: path.join(OUTPUT_DIR, 'fallback'),
      fileName: safeUrl.substring(0, MAX_FILENAME_LENGTH - 3) + '.md'
    };
  }
}

/**
 * Scrapes a webpage and returns its cleaned text content with metadata
 * @param url The URL of the page to scrape
 * @returns Promise with scraped content and metadata
 */
async function scrapePage(url: string): Promise<{
  content: string;
  title?: string;
  scrapedAt: string;
  url: string;
} | null> {
  console.log(`Scraping: ${url}`);
  
  try {
    const loader = new PuppeteerWebBaseLoader(url, {
      launchOptions: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
      gotoOptions: {
        waitUntil: "domcontentloaded",
        timeout: 30000, // 30 second timeout
      },
      async evaluate(page, browser) {
        const result = await page.evaluate(() => {
          // Remove unwanted elements
          const elementsToRemove = [
            'nav', 'header', 'footer', 'aside', 
            '.navigation', '.nav', '.sidebar', '.menu',
            '.breadcrumb', '.search', '.cookie', '.banner',
            'script', 'style', 'noscript', 'iframe',
            '[role="navigation"]', '[role="banner"]', '[role="complementary"]'
          ];
          
          elementsToRemove.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => el.remove());
          });
          
          // Try to find main content area
          const mainContent = 
            document.querySelector('main') ||
            document.querySelector('article') ||
            document.querySelector('[role="main"]') ||
            document.querySelector('.content') ||
            document.querySelector('#content') ||
            document.querySelector('.main-content') ||
            document.querySelector('.post-content') ||
            document.querySelector('.entry-content') ||
            document.body;
          
          return mainContent?.innerHTML || '';
        });
        
        await browser.close();
        return result;
      },
    });
    
    const docs = await loader.load();
    const rawContent = docs[0]?.pageContent || '';
    
    // Convert HTML to Markdown-formatted content
    const cleanContent = convertHtmlToMarkdown(rawContent);
    
    if (!cleanContent) {
      console.warn(`No content extracted from ${url}`);
      return null;
    }
    
    // Extract title from the cleaned content (first line that looks like a title)
    const lines = cleanContent.split('\n').map(line => line.trim()).filter(line => line);
    const title = lines[0] || 'Untitled';
    
    return {
      content: cleanContent,
      title: title.substring(0, 200), // Limit title length
      scrapedAt: new Date().toISOString(),
      url
    };
    
  } catch (error) {
    console.error(`Error scraping ${url}:`, error);
    return null;
  }
}

/**
 * Converts HTML content to well-formatted Markdown
 * @param html The HTML content to convert
 * @returns Cleaned and formatted Markdown content
 */
function convertHtmlToMarkdown(html: string): string {
  if (!html) return '';
  
  let content = html;
  
  // Remove script and style tags completely
  content = content.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  content = content.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  content = content.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '');
  
  // Convert headings to Markdown
  content = content.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '\n# $1\n');
  content = content.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '\n## $1\n');
  content = content.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '\n### $1\n');
  content = content.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '\n#### $1\n');
  content = content.replace(/<h5[^>]*>(.*?)<\/h5>/gi, '\n##### $1\n');
  content = content.replace(/<h6[^>]*>(.*?)<\/h6>/gi, '\n###### $1\n');
  
  // Convert paragraphs
  content = content.replace(/<p[^>]*>(.*?)<\/p>/gi, '\n$1\n');
  
  // Convert line breaks
  content = content.replace(/<br\s*\/?>/gi, '\n');
  
  // Convert lists
  content = content.replace(/<ul[^>]*>/gi, '\n');
  content = content.replace(/<\/ul>/gi, '\n');
  content = content.replace(/<ol[^>]*>/gi, '\n');
  content = content.replace(/<\/ol>/gi, '\n');
  content = content.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');
  
  // Convert links
  content = content.replace(/<a[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi, '[$2]($1)');
  
  // Convert emphasis
  content = content.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
  content = content.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
  content = content.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
  content = content.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');
  
  // Convert code
  content = content.replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`');
  content = content.replace(/<pre[^>]*>(.*?)<\/pre>/gi, '\n```\n$1\n```\n');
  
  // Convert blockquotes
  content = content.replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi, '\n> $1\n');
  
  // Convert divs and spans to just their content
  content = content.replace(/<div[^>]*>/gi, '\n');
  content = content.replace(/<\/div>/gi, '\n');
  content = content.replace(/<span[^>]*>(.*?)<\/span>/gi, '$1');
  
  // Remove all remaining HTML tags
  content = content.replace(/<[^>]*>/g, '');
  
  // Decode HTML entities
  content = content
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '…');
  
  // Clean up whitespace and formatting
  content = content
    .replace(/\n\s*\n\s*\n/g, '\n\n') // Replace multiple newlines with double newlines
    .replace(/[ \t]+/g, ' ')          // Replace multiple spaces/tabs with single space
    .replace(/^\s+|\s+$/g, '')        // Trim start and end
    .replace(/\n /g, '\n')            // Remove spaces at start of lines
    .replace(/ \n/g, '\n');           // Remove spaces at end of lines
  
  return content;
}

/**
 * Ensures a directory exists, creating it if necessary
 * @param dirPath The directory path to ensure exists
 */
async function ensureDirectoryExists(dirPath: string): Promise<void> {
  try {
    await fs.promises.access(dirPath);
  } catch {
    await fs.promises.mkdir(dirPath, { recursive: true });
    console.log(`Created directory: ${dirPath}`);
  }
}

/**
 * Saves scraped content to a file with metadata
 * @param filePath The full file path to save to
 * @param data The scraped data to save
 */
async function saveContentToFile(filePath: string, data: {
  content: string;
  title?: string;
  scrapedAt: string;
  url: string;
}): Promise<void> {
  const fileContent = `---
Title: ${data.title || 'Untitled'}
URL: ${data.url}
Scraped At: ${data.scrapedAt}
---

${data.content}
`;

  await fs.promises.writeFile(filePath, fileContent, 'utf-8');
  console.log(`✅ Saved: ${filePath}`);
}

/**
 * Main function to scrape all URLs and save them as files
 */
async function scrapeToFiles(): Promise<void> {
  console.log('🕷️  Starting webpage scraping to files...\n');
  
  try {
    // Get URLs to process
    const urls = await getUrlsToProcess();
    console.log(`📋 Found ${urls.length} URLs to scrape\n`);
    
    if (urls.length === 0) {
      console.warn('No URLs found to process. Exiting.');
      return;
    }
    
    // Ensure output directory exists
    await ensureDirectoryExists(OUTPUT_DIR);
    
    let successCount = 0;
    let failureCount = 0;
    
    // Process each URL
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      console.log(`\n[${i + 1}/${urls.length}] Processing: ${url}`);
      
      try {
        // Scrape the page
        const scrapedData = await scrapePage(url);
        
        if (!scrapedData) {
          console.warn(`❌ Failed to scrape content from: ${url}`);
          failureCount++;
          continue;
        }
        
        // Determine file path
        const { dirPath, fileName } = urlToFilePath(url);
        await ensureDirectoryExists(dirPath);
        
        const fullFilePath = path.join(dirPath, fileName);
        
        // Check if file already exists
        try {
          await fs.promises.access(fullFilePath);
          console.log(`📄 File already exists, overwriting: ${fullFilePath}`);
        } catch {
          // File doesn't exist, which is fine
        }
        
        // Save the content
        await saveContentToFile(fullFilePath, scrapedData);
        successCount++;
        
        // Add a small delay to be respectful to servers
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`❌ Error processing ${url}:`, error);
        failureCount++;
      }
    }
    
    // Summary
    console.log(`\n📊 Scraping Summary:`);
    console.log(`✅ Successfully scraped: ${successCount} pages`);
    console.log(`❌ Failed to scrape: ${failureCount} pages`);
    console.log(`📁 Output directory: ${OUTPUT_DIR}`);
    
    if (successCount > 0) {
      console.log(`\n🎉 Scraping completed! Check the '${path.basename(OUTPUT_DIR)}' directory for your files.`);
    }
    
  } catch (error) {
    console.error('💥 Fatal error during scraping process:', error);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  scrapeToFiles().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { scrapeToFiles, scrapePage, urlToFilePath };
