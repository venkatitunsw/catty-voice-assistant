import os
import time
import uuid
import logging
from typing import List, Dict, Any, Optional

from app.config import settings

logger = logging.getLogger("catty.memory")

class MemoryStore:
    """
    Pinecone Vector Store for Catty Assistant.
    Provides semantic search over user notes, facts, and preferences.
    Includes an in-memory fallback if Pinecone API key is not configured yet.
    """
    def __init__(self):
        self.pinecone_client = None
        self.index = None
        self.embeddings = None
        self.in_memory_store: List[Dict[str, Any]] = []
        self._initialize()

    def _initialize(self):
        # 1. Initialize Gemini Embeddings
        if settings.GEMINI_API_KEY:
            try:
                from langchain_google_genai import GoogleGenerativeAIEmbeddings
                self.embeddings = GoogleGenerativeAIEmbeddings(
                    model="models/text-embedding-004",
                    google_api_key=settings.GEMINI_API_KEY
                )
                logger.info("Initialized GoogleGenerativeAIEmbeddings (text-embedding-004)")
            except Exception as e:
                logger.warning(f"Failed to initialize Google Embeddings: {e}")
                self.embeddings = None

        # 2. Initialize Pinecone Client
        if settings.PINECONE_API_KEY and settings.PINECONE_API_KEY != "your_pinecone_api_key_here":
            try:
                from pinecone import Pinecone, ServerlessSpec
                self.pinecone_client = Pinecone(api_key=settings.PINECONE_API_KEY)
                
                # Check existing indexes
                existing_indexes = [idx.name for idx in self.pinecone_client.list_indexes()]
                if settings.PINECONE_INDEX_NAME not in existing_indexes:
                    logger.info(f"Creating serverless Pinecone index: {settings.PINECONE_INDEX_NAME}")
                    self.pinecone_client.create_index(
                        name=settings.PINECONE_INDEX_NAME,
                        dimension=768,  # text-embedding-004 dimension
                        metric="cosine",
                        spec=ServerlessSpec(cloud="aws", region="us-east-1")
                    )
                self.index = self.pinecone_client.Index(settings.PINECONE_INDEX_NAME)
                logger.info(f"Connected to Pinecone index: {settings.PINECONE_INDEX_NAME}")
            except Exception as e:
                logger.warning(f"Could not connect to Pinecone ({e}). Using local in-memory fallback.")
                self.index = None
        else:
            logger.info("Pinecone API key not provided. Operating with in-memory memory store.")

    def upsert_note(self, content: str, category: str = "general") -> Dict[str, Any]:
        """Save a new note or fact into vector memory."""
        note_id = str(uuid.uuid4())[:8]
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        metadata = {
            "id": note_id,
            "content": content,
            "category": category,
            "timestamp": timestamp
        }

        # Try Pinecone upsert
        if self.index and self.embeddings:
            try:
                vector = self.embeddings.embed_query(content)
                self.index.upsert(vectors=[(note_id, vector, metadata)])
                logger.info(f"Upserted note to Pinecone [{note_id}]: {content}")
                return metadata
            except Exception as e:
                logger.error(f"Pinecone upsert failed ({e}). Saving to in-memory fallback.")

        # Fallback to in-memory storage
        self.in_memory_store.append(metadata)
        logger.info(f"Upserted note to in-memory store [{note_id}]: {content}")
        return metadata

    def search_notes(self, query: str, top_k: int = 3) -> List[Dict[str, Any]]:
        """Semantic search for memories matching user's query."""
        # Search via Pinecone
        if self.index and self.embeddings:
            try:
                query_vector = self.embeddings.embed_query(query)
                results = self.index.query(
                    vector=query_vector,
                    top_k=top_k,
                    include_metadata=True
                )
                memories = []
                for match in results.matches:
                    if match.metadata:
                        memories.append({
                            "content": match.metadata.get("content", ""),
                            "category": match.metadata.get("category", "general"),
                            "timestamp": match.metadata.get("timestamp", ""),
                            "score": float(match.score) if hasattr(match, "score") else 1.0
                        })
                return memories
            except Exception as e:
                logger.error(f"Pinecone query failed ({e}). Falling back to in-memory search.")

        # In-memory keyword/substring match fallback
        query_lower = query.lower()
        matches = []
        for note in self.in_memory_store:
            content_lower = note["content"].lower()
            # Simple keyword overlap match
            score = sum(1 for word in query_lower.split() if word in content_lower)
            if score > 0 or len(self.in_memory_store) <= top_k:
                matches.append({
                    "content": note["content"],
                    "category": note["category"],
                    "timestamp": note["timestamp"],
                    "score": score
                })
        matches.sort(key=lambda x: x["score"], reverse=True)
        return matches[:top_k]

# Global singleton instance
memory_store = MemoryStore()
