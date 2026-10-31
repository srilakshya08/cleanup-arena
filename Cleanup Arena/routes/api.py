"""
Cleanup Arena — Flask REST API Blueprint
Implements all modular endpoints for email retrieval, search, filtering,
stats, player progress, cleanup preview, execution, and Guardian protection.
"""

from flask import Blueprint, request, jsonify
from services.db import DatabaseService

api_bp = Blueprint("api", __name__, url_prefix="/api")


@api_bp.route("/emails", methods=["GET"])
def get_emails():
    """
    GET /api/emails
    Retrieves email list with query parameters:
      - category: 'all' | 'spam' | 'newsletter' | 'notification' | 'important'
      - status: 'all' | 'pending' | 'cleaned' | 'starred'
      - search: string
      - sort: 'newest' | 'oldest'
    """
    category = request.args.get("category", "all")
    status = request.args.get("status", "pending")
    search = request.args.get("search", None)
    sort = request.args.get("sort", "newest")

    try:
        emails = DatabaseService.get_emails(
            category=category,
            status=status,
            search=search,
            sort=sort
        )
        return jsonify({
            "success": True,
            "count": len(emails),
            "data": emails,
        }), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@api_bp.route("/stats", methods=["GET"])
def get_stats():
    """
    GET /api/stats
    Returns dynamic monster HPs, pending counts, and overall cleanup progress.
    """
    try:
        stats = DatabaseService.get_stats()
        return jsonify({
            "success": True,
            "data": stats,
        }), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@api_bp.route("/health", methods=["GET"])
def health_check():
    """
    GET /api/health
    Production liveness and readiness health check for Cloud Run.
    """
    progress = DatabaseService.get_player_progress()
    return jsonify({
        "status": "healthy",
        "service": "cleanup-arena",
        "database": "connected",
        "timestamp": progress.get("updated_at")
    }), 200


@api_bp.route("/progress", methods=["GET"])
def get_progress():
    """
    GET /api/progress
    Returns player progress: XP, Level, Total Cleaned, and unlocked Achievements.
    """
    try:
        progress = DatabaseService.get_player_progress()
        achievements = DatabaseService.get_achievements()
        xp = progress.get("xp", 0)
        level = progress.get("level", 1)

        # Calculate XP progress to next level (500 XP per level bracket)
        level_base_xp = (level - 1) * 500
        next_level_xp = level * 500
        current_level_progress_xp = max(0, xp - level_base_xp)
        xp_pct = min(100, int(round((current_level_progress_xp / 500) * 100)))

        return jsonify({
            "success": True,
            "data": {
                **progress,
                "current_level_xp": current_level_progress_xp,
                "next_level_threshold": 500,
                "xp_percentage": xp_pct,
                "achievements": achievements,
            }
        }), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@api_bp.route("/achievements", methods=["GET"])
def get_achievements():
    """
    GET /api/achievements
    Returns live achievements list and unlock status.
    """
    try:
        achievements = DatabaseService.get_achievements()
        return jsonify({
            "success": True,
            "count": len(achievements),
            "data": achievements,
        }), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@api_bp.route("/cleanup/preview", methods=["POST"])
def cleanup_preview():
    """
    POST /api/cleanup/preview
    Validates email IDs for cleanup eligibility and returns proposed actions.
    Input payload:
      { "email_ids": ["uuid-1", "uuid-2"] }
    """
    data = request.get_json(silent=True) or {}
    email_ids = data.get("email_ids", [])

    if not isinstance(email_ids, list) or len(email_ids) == 0:
        return jsonify({
            "success": False,
            "error": "A non-empty list of email_ids is required."
        }), 400

    try:
        preview = DatabaseService.preview_cleanup(email_ids)
        return jsonify({
            "success": True,
            "data": preview,
        }), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@api_bp.route("/cleanup/execute", methods=["POST"])
def cleanup_execute():
    """
    POST /api/cleanup/execute
    Atomically updates database records, awards XP, and returns updated monster HP.
    Input payload:
      { "email_ids": ["uuid-1", "uuid-2"] }
    """
    data = request.get_json(silent=True) or {}
    email_ids = data.get("email_ids", [])

    if not isinstance(email_ids, list) or len(email_ids) == 0:
        return jsonify({
            "success": False,
            "error": "A non-empty list of email_ids is required."
        }), 400

    try:
        result = DatabaseService.execute_cleanup(email_ids)
        if not result.get("success"):
            return jsonify(result), 400
        return jsonify(result), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@api_bp.route("/important/action", methods=["POST"])
def important_action():
    """
    POST /api/important/action
    Records individual protection action for Important Mail Guardian.
    Input payload:
      { "email_id": "uuid-1", "action": "keep" | "star" | "archive" | "follow_up" }
    """
    data = request.get_json(silent=True) or {}
    email_id = data.get("email_id")
    action = data.get("action")

    if not email_id or not action:
        return jsonify({
            "success": False,
            "error": "Both email_id and action are required."
        }), 400

    try:
        result = DatabaseService.execute_important_action(email_id, action)
        if not result.get("success"):
            return jsonify(result), 400
        return jsonify(result), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@api_bp.route("/history", methods=["GET"])
def get_history():
    """
    GET /api/history
    Returns audit log of recent cleanup operations.
    """
    limit = request.args.get("limit", 20, type=int)
    try:
        history = DatabaseService.get_cleanup_history(limit=limit)
        return jsonify({
            "success": True,
            "count": len(history),
            "data": history,
        }), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
