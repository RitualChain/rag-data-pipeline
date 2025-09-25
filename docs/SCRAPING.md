# Web Scraping to Files

This document explains how to use the `scrape-to-files` script to scrape webpages and save them as organized files.

## Overview

The `scrape-to-files` script scrapes specified webpages and saves them as well-formatted Markdown files in a directory structure that mirrors the URL paths. Each file includes metadata and cleaned, structured content.

## Usage

```bash
# Run the scraping script
pnpm scrape-to-files
```

## How it Works

1. **URL Loading**: The script uses the same URL loading mechanism as other scripts, reading URLs from files in `src/scripts/data/links/architecture/`

2. **Directory Structure**: Creates a directory structure that mirrors the URL paths:
   ```
   scraped/
   └── architecture/
       ├── evm++.md
       ├── execution-sidecars.md
       ├── resonance.md
       └── ...
   ```

3. **File Format**: Each file includes metadata header and cleaned content:
   ```
   ---
   Title: Page Title
   URL: https://example.com/page
   Scraped At: 2025-09-21T21:09:39.657Z
   ---

   [Cleaned page content here...]
   ```

## Features

- **Smart Path Conversion**: Converts URLs to safe file paths
- **Markdown Formatting**: Converts HTML to well-structured Markdown
- **Content Cleaning**: Removes navigation, ads, and unwanted elements
- **Semantic Structure**: Preserves headings, lists, links, and emphasis
- **Metadata Inclusion**: Adds title, URL, and timestamp to each file
- **Error Handling**: Continues processing even if some URLs fail
- **Respectful Scraping**: Includes delays between requests
- **Progress Tracking**: Shows detailed progress and summary

### Markdown Conversion Features

- **Headings**: `<h1>` to `<h6>` → `#` to `######`
- **Lists**: `<ul>/<ol>/<li>` → Markdown lists with `-`
- **Links**: `<a href="">` → `[text](url)`
- **Emphasis**: `<strong>/<b>` → `**bold**`, `<em>/<i>` → `*italic*`
- **Code**: `<code>` → `inline code`, `<pre>` → code blocks
- **Blockquotes**: `<blockquote>` → `> quoted text`
- **Clean Structure**: Removes navigation, headers, footers automatically

## Configuration

- **Output Directory**: `scraped/` (in project root)
- **Max Filename Length**: 100 characters
- **Request Delay**: 1 second between requests
- **Timeout**: 30 seconds per page

## File Naming

- Invalid characters in URLs are replaced with underscores
- Files get `.md` extension for Markdown format
- Long filenames are truncated with `...`
- Empty paths default to `index.md`

## Error Handling

- Failed scrapes are logged but don't stop the process
- Fallback directory structure for unparseable URLs
- Graceful handling of network timeouts and errors

## Output

The script provides:
- Real-time progress updates
- Success/failure counts
- Final summary with statistics
- Directory location of saved files

## Example Output

```
🕷️  Starting webpage scraping to files...

📋 Found 7 URLs to scrape

[1/7] Processing: https://www.ritualfoundation.org/docs/architecture/evm++
✅ Saved: scraped/www.ritualfoundation.org/docs/architecture/evm++.md

📊 Scraping Summary:
✅ Successfully scraped: 7 pages
❌ Failed to scrape: 0 pages
📁 Output directory: /path/to/scraped

🎉 Scraping completed!
```

## Use Cases

- **Documentation Backup**: Create local copies of documentation
- **Content Analysis**: Prepare content for analysis or processing
- **Offline Access**: Save web content for offline use
- **Data Pipeline**: Pre-process content before embedding/indexing
