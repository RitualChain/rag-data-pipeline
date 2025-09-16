import path from 'node:path';
import { getUrlsToProcess, loadUrlsFromFiles } from '../utils/url-loader';

async function testUrlLoader() {
    console.log('=== Testing URL Loader ===\n');

    try {
        // Test loading URLs from the links directory
        const linksDir = path.join(__dirname, 'data/links');
        console.log(`Loading URLs from: ${linksDir}`);

        const urls = await loadUrlsFromFiles(linksDir);

        console.log(`\nTotal URLs loaded: ${urls.length}`);
        console.log('\nURLs by category:');

        // Group URLs by domain for better visualization
        const urlsByDomain: { [key: string]: string[] } = {};

        urls.forEach(url => {
            try {
                const domain = new URL(url).hostname;
                if (!urlsByDomain[domain]) {
                    urlsByDomain[domain] = [];
                }
                urlsByDomain[domain].push(url);
            } catch (error) {
                console.warn(`Invalid URL format: ${url}`);
            }
        });

        Object.entries(urlsByDomain).forEach(([domain, domainUrls]) => {
            console.log(`\n${domain}: ${domainUrls.length} URLs`);
            domainUrls.slice(0, 3).forEach(url => console.log(`  - ${url}`));
            if (domainUrls.length > 3) {
                console.log(`  ... and ${domainUrls.length - 3} more`);
            }
        });

        // Test the main getUrlsToProcess function
        console.log('\n=== Testing getUrlsToProcess() ===');
        const processUrls = await getUrlsToProcess();
        console.log(`getUrlsToProcess() returned ${processUrls.length} URLs`);

        if (processUrls.length === urls.length) {
            console.log('✅ URL loading test passed!');
        } else {
            console.log('❌ URL loading test failed - count mismatch');
        }

    } catch (error) {
        console.error('❌ Error testing URL loader:', error);
    }
}

// Run the test
testUrlLoader();
