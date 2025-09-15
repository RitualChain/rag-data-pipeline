import dotenv from 'dotenv';
dotenv.config();

export const {
    ASTRA_DB_NAMESPACE,
    ASTRA_DB_COLLECTION,
    ASTRA_DB_API_ENDPOINT,
    ASTRA_DB_APPLICATION_TOKEN,
    OPENAI_API_KEY,
    OPENAI_EMBEDDING_MODEL_NAME,
    URLS_TO_PROCESS,
} = process.env;