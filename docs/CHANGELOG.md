
# Changelog
All notable changes to this project will be documented in this file.
 
The format is based on [Keep a Changelog](http://keepachangelog.com/)
and this project adheres to [Semantic Versioning](http://semver.org/).
 
## [Unreleased]

### Added
- Added `similarity` property to `RagDocument` interface to store similarity scores from vector searches
- Added `similarityThreshold` property to `Retriever` class for filtering out irrelevant documents
- Added `retrieverSimilarityThreshold` configuration option to `RAGPipelineConfig`

### Changed
- Enhanced logging in vector store and retriever components for better debugging
- Improved error handling in AstraDB similarity search implementation

### Fixed
- Fixed AstraDB similarity search to properly return similarity scores
- Fixed integration test by implementing similarity threshold filtering
- Fixed handling of unrelated queries by properly filtering out irrelevant documents

## [0.0.1] - 2025-06-26

### Fixed
### Added
### Changed
