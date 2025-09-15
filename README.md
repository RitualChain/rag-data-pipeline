# RAG Data Pipeline

This project provides a data pipeline for populating and interacting with a vector store in Astra DB. It uses a command-line interface (CLI) to scrape data from URLs, generate embeddings using OpenAI, and insert the data into the vector store.

## Getting Started

These instructions will get you a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

- Node.js (v18 or higher)
- pnpm

### Installation

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/DeDevsClub/rag-data-pipeline.git
    cd rag-data-pipeline
    ```

2.  **Install dependencies:**

    ```bash
    pnpm install
    ```

3.  **Set up environment variables:**

    Create a `.env` file in the root of the project and add the following variables:

    ```
    ASTRA_DB_API_ENDPOINT="your_astra_db_api_endpoint"
    ASTRA_DB_APPLICATION_TOKEN="your_astra_db_application_token"
    ASTRA_DB_NAMESPACE="your_astra_db_namespace"
    ASTRA_DB_COLLECTION="your_astra_db_collection"
    OPENAI_API_KEY="your_openai_api_key"
    URLS_TO_PROCESS="https://example.com"
    ```

## Usage

The following scripts are available in the `package.json` file:

-   `pnpm run build`: Compiles the TypeScript code to JavaScript.
-   `pnpm run start`: Starts the application from the compiled code.
-   `pnpm run dev`: Runs the application in development mode using `ts-node`.
-   `pnpm run test`: Runs the test script.
-   `pnpm run seed`: Scrapes data from the URLs specified in `URLS_TO_PROCESS`, generates embeddings, and inserts the data into the vector store.
-   `pnpm run update`: Updates the database with new data from the URLs specified in `URLS_TO_PROCESS`.
-   `pnpm run reset`: Resets the database by deleting the collection.
-   `pnpm run start:api`: Starts the API server.
-   `pnpm run query`: Queries the vector store with a given filter.

### CLI Examples

-   **Seed the database:**

    ```bash
    pnpm run seed
    ```

-   **Update the database:**

    ```bash
    pnpm run update
    ```

-   **Query the database:**

    To query for all documents:

    ```bash
    pnpm run query
    ```

    To query with a filter:

    ```bash
    pnpm run query '{"url":"https://example.com"}'
    ```

## Querying with cURL

You can also query your Astra DB collection directly using `curl` and the JSON API. This is useful for testing or for environments where you might not have the Node.js scripts readily available.

**Example:** Find all text chunks from the URL `https://fumadocs.dev/llms-full.txt` that contain the word 'fumadocs' (case-insensitive), and only return the `url` and `text_chunk` fields. This query targets the `ASTRA_DB_COLLECTION` collection within the `ASTRA_DB_NAMESPACE` keyspace.

```bash
curl -L -X POST \
  '${ASTRA_DB_API_ENDPOINT}/api/json/v1/${ASTRA_DB_NAMESPACE}/${ASTRA_DB_COLLECTION}/find' \
  -H 'X-Cassandra-Token: ${ASTRA_DB_APPLICATION_TOKEN}' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  -d '{
        "filter": {
          "url": "https://fumadocs.dev/llms-full.txt",
          "text_chunk": { "$regex": "fumadocs", "$options": "i" }
        },
        "projection": {
          "url": 1,
          "text_chunk": 1
        }
      }'
```

**Note:**

-   Replace `${ASTRA_DB_APPLICATION_TOKEN}` with your actual Astra DB Application Token.
-   The collection name (`ASTRA_DB_COLLECTION`) and keyspace (`ASTRA_DB_NAMESPACE`) in the URL should match your Astra DB setup. These values are typically configured via `ASTRA_DB_COLLECTION` and `ASTRA_DB_NAMESPACE` environment variables for the scripts.
-   The filter payload can be adjusted to your needs.
