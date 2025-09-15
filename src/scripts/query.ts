import { DataAPIClient } from "@datastax/astra-db-ts";
import { ASTRA_DB_API_ENDPOINT, ASTRA_DB_APPLICATION_TOKEN, ASTRA_DB_NAMESPACE, ASTRA_DB_COLLECTION } from '../constants';

// Validate environment variables
if (!ASTRA_DB_API_ENDPOINT || !ASTRA_DB_APPLICATION_TOKEN || !ASTRA_DB_NAMESPACE) {
  console.error(
    "Missing one or more required environment variables: ASTRA_DB_API_ENDPOINT, ASTRA_DB_APPLICATION_TOKEN, ASTRA_DB_NAMESPACE"
  );
  process.exit(1);
}

const main = async () => {
  // process.argv[0] is node, process.argv[1] is the script path
  // const collectionName = ASTRA_DB_COLLECTION;
  const filterJsonString = process.argv[2];
  // Future enhancement: process.argv[3] for optionsJsonString (projection, sort, limit)

  let filter = {};
  if (filterJsonString) {
    try {
      filter = JSON.parse(filterJsonString);
    } catch (e: any) {
      console.error("Invalid JSON filter string provided:", e.message);
      console.log("Filter string was:", filterJsonString);
      console.log("\nUsage: pnpm run query [filterJsonString]");
      console.log(`Queries the collection defined in your ASTRA_DB_COLLECTION environment variable ('${ASTRA_DB_COLLECTION!}').`);
      console.log("\nTo query all documents (no filter): pnpm run query");
      console.log("To query with a filter: pnpm run query '{\"field_name\":\"value\"}'");
      console.log("Example: pnpm run query '{\"category\":\"books\"}'");
      // Placeholder for future options argument:
      // console.log("Future with options: pnpm run query '[filterJsonString]' '[optionsJsonString]'");
      // console.log("Example with options: pnpm run query '{\"category\":\"books\"}' '{\"limit\":5}'");
      process.exit(1);
    }
  }
  
  // Placeholder for options - can be expanded later
  // let options: FindOptions = {}; 
  // if (optionsJsonString) { try { options = JSON.parse(optionsJsonString); } catch ... }


  console.log(`[QueryScript] Connecting to AstraDB at ${ASTRA_DB_API_ENDPOINT}, keyspace: ${ASTRA_DB_NAMESPACE}`);
  console.log(`[QueryScript] Querying collection: '${ASTRA_DB_COLLECTION!}'`);
  console.log(`[QueryScript] Using filter:`, JSON.stringify(filter, null, 2));
  // console.log(`[QueryScript] Using options:`, JSON.stringify(options, null, 2));


  try {
    const client = new DataAPIClient(ASTRA_DB_APPLICATION_TOKEN);
        const db = client.db(ASTRA_DB_API_ENDPOINT!, {
      keyspace: ASTRA_DB_NAMESPACE,
    });

    const collection = db.collection(ASTRA_DB_COLLECTION!);
    
    // Perform the find operation.
    // Add 'options' as the second argument to find() if you implement them.
    const cursor = collection.find(filter); 
    const documents = await cursor.toArray();
    
    console.log("\n[QueryScript] Query executed successfully.");

    if (documents && documents.length > 0) {
      console.log(`[QueryScript] Documents found: ${documents.length}`);
      console.log("[QueryScript] Results:");
      documents.forEach((doc: any, index: number) => {
        // Remove _id if it's an AstraDB ObjectId for cleaner display, or handle as needed
        const displayDoc = { ...doc };
        if (displayDoc._id && typeof displayDoc._id === 'object' && displayDoc._id.toString) {
            // displayDoc._id = displayDoc._id.toString(); // Or delete if not needed
        }
        console.log(`Document ${index + 1}:`, JSON.stringify(displayDoc, null, 2));
      });
    } else {
      console.log("[QueryScript] No documents found matching the filter.");
    }

  } catch (error: any) {
    console.error("[QueryScript] Error executing query:", error.message || error);
    if (error.errors) { // AstraDB specific errors might be nested
        console.error("Details:", JSON.stringify(error.errors, null, 2));
    }
    process.exit(1);
  }
};

main().catch(error => {
  console.error("[QueryScript] Unhandled error in main execution:", error.message || error);
  process.exit(1);
});