import os


class Config:
    """Base configuration loaded from environment variables."""
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev")
    SUPABASE_URL = os.environ.get("SUPABASE_URL")
    SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    DEBUG = False


class DevelopmentConfig(Config):
    DEBUG = True


class ProductionConfig(Config):
    pass
