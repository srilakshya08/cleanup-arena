import os
from flask import Flask, render_template

# Load .env file automatically if present
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from config import Config
from routes.api import api_bp
from services.db import DatabaseService

# Create the Flask application instance
app = Flask(__name__)
app.config.from_object(Config)

# Register API Blueprint
app.register_blueprint(api_bp)

# Ensure demo emails are seeded on startup if database is empty
try:
    if len(DatabaseService.get_emails(category="all", status="all", limit=1)) == 0:
        DatabaseService.seed_demo_emails()
except Exception as e:
    print(f"[*] Database startup check note: {e}")


@app.route("/")
def homepage():
    """Serve the main game arena page."""
    return render_template("index.html")


# Entry point: only runs when you execute this file directly
# (e.g. `python app.py`), not when it is imported by another module.
if __name__ == "__main__":
    app.run(debug=True, port=5000)
