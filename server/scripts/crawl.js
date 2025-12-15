import crawlController from '../controllers/crawl.js';

console.log('Starting RSS feed crawl...');

// Call the synchronous crawl function directly
crawlController.performCrawl()
  .then(result => {
    console.log('\n=== Crawl Completed ===');
    console.log(`Total feeds: ${result.total}`);
    console.log(`Successfully processed: ${result.processed}`);
    console.log(`Errors: ${result.errors}`);
    process.exit(0);
  })
  .catch(err => {
    console.error('\n=== Crawl Failed ===');
    console.error('Error during crawl:', err);
    process.exit(1);
  });
