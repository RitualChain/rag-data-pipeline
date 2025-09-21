import fs from 'node:fs';
import path from 'node:path';

/**
 * Reads all URLs from text files in the links directory
 * @param linksDir Path to the links directory
 * @returns Array of URLs found in all text files
 */
// export async function loadUrlsFromFiles(linksDir: string = path.join(__dirname, '../scripts/data/links')): Promise<string[]> {
//     const urls: string[] = [];

//     try {
//         // Read all subdirectories and files in the links directory
//         const entries = await fs.promises.readdir(linksDir, { withFileTypes: true });

//         for (const entry of entries) {
//             const fullPath = path.join(linksDir, entry.name);

//             if (entry.isDirectory()) {
//                 // Recursively read URLs from subdirectories
//                 const subDirUrls = await loadUrlsFromFiles(fullPath);
//                 urls.push(...subDirUrls);
//             } else if (entry.isFile() && entry.name.endsWith('.txt')) {
//                 // Read URLs from text files
//                 const fileContent = await fs.promises.readFile(fullPath, 'utf-8');
//                 const fileUrls = fileContent
//                     .split('\n')
//                     .map(line => line.trim())
//                     .filter(line => line?.startsWith('http'));

//                 urls.push(...fileUrls);
//                 console.log(`Loaded ${fileUrls.length} URLs from ${entry.name}`);
//             }
//         }

//         console.log(`Total URLs loaded: ${urls.length}`);
//         return urls;
//     } catch (error) {
//         console.error('Error loading URLs from files:', error);
//         throw error;
//     }
// }

export async function loadUrlsFromArchitecture(linksDir: string = path.join(__dirname, '../scripts/data/links/architecture')): Promise<string[]> {
    const urls: string[] = [];

    try {
        // Read all subdirectories and files in the links directory
        const entries = await fs.promises.readdir(linksDir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(linksDir, entry.name);

            if (entry.isDirectory()) {
                // Recursively read URLs from subdirectories
                const subDirUrls = await loadUrlsFromArchitecture(fullPath);
                urls.push(...subDirUrls);
            } else if (entry.isFile() && entry.name.endsWith('.txt')) {
                // Read URLs from text files
                const fileContent = await fs.promises.readFile(fullPath, 'utf-8');
                const fileUrls = fileContent
                    .split('\n')
                    .map(line => line.trim())
                    .filter(line => line?.startsWith('http'));

                urls.push(...fileUrls);
                console.log(`Loaded ${fileUrls.length} URLs from ${entry.name}`);
            }
        }

        console.log(`Total URLs loaded: ${urls.length}`);
        return urls;
    } catch (error) {
        console.error('Error loading URLs from files:', error);
        throw error;
    }
}

/**
 * Gets all URLs either from files or from environment variable as fallback
 * @returns Array of URLs to process
 */
export async function getUrlsToProcess(): Promise<string[]> {
    try {
        // Try to load URLs from files first
        const urls = await loadUrlsFromArchitecture();

        if (urls.length > 0) {
            return urls;
        }

        // Fallback to environment variable if no URLs found in files
        const envUrls = process.env.URLS_TO_PROCESS;
        if (envUrls) {
            return envUrls.split(',').map(url => url.trim()).filter(url => url);
        }

        throw new Error('No URLs found in files or environment variables');
    } catch (error) {
        console.error('Error getting URLs to process:', error);
        throw error;
    }
}
