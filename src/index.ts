// RAG SDK Entry Point

console.log("RAG SDK Initializing...");

export const version = "0.0.1";

export function helloSDK(): string {
  return "Hello from RAG SDK — Version: " + version;
}

export * from './classes';
export * from './scripts';
