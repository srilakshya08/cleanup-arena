"""
Cleanup Arena — Supabase Database Client Service
Handles secure initialization and singleton reuse of the Supabase client.
"""

import os
from typing import Optional

# Lazy import to avoid import errors when supabase package is not yet installed
_supabase_client = None


def get_supabase_client():
    """
    Returns a singleton instance of the Supabase client initialized with the
    backend service-role key for administrative operations.

    Raises:
        ValueError: If SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set.
        ImportError: If the supabase python package is not installed.
    """
    global _supabase_client
    if _supabase_client is not None:
        return _supabase_client

    try:
        from supabase import create_client, Client
    except ImportError:
        raise ImportError(
            "The 'supabase' Python package is not installed. "
            "Please install it via: pip install supabase"
        )

    supabase_url = os.environ.get("SUPABASE_URL")
    service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    if not supabase_url or not service_role_key:
        raise ValueError(
            "Supabase environment variables missing. Please configure "
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your local .env file."
        )

    _supabase_client = create_client(supabase_url, service_role_key)
    return _supabase_client
