/* ═══════════════════════════════════════════════════════════════
   Cleanup Arena — Advanced Game Feel, Combat FX & RPG Interface
   Implements:
   1. Retro-Modern Web Audio Procedural Synthesizer (Zero MP3 Dependencies)
   2. Dynamic Boss Battle Stage with Dual HP Bar (Ghost Damage Trail)
   3. Player Attack Theater (Projectiles, Lightning, Slashes, Holy Aegis)
   4. Monster Character Animations (5 States: Idle, Hit, Attack, Low-HP, Defeat)
   5. Interactive In-Arena Email Reading Panel with Sanitized Content
   6. Battle Event Bus & Real-Time Combat Event Log
   7. Backend-Verified State Transitions & Double-Action Protection
   8. Accessibility & Audio/Motion Preference Controls
   ═══════════════════════════════════════════════════════════════ */

document.addEventListener("DOMContentLoaded", () => {

  /* ─────────────────────────────────────────────────────────────
     1. APPLICATION STATE
     ───────────────────────────────────────────────────────────── */
  const state = {
    activeView: "arena",        // "arena" | "inbox" | "progress"
    activeCategory: "all",      // "all" | "spam" | "newsletter" | "notification" | "important"
    statusFilter: "pending",    // "all" | "pending" | "cleaned" | "starred"
    dateSort: "newest",         // "newest" | "oldest"
    searchQuery: "",            // search query
    selectedIds: new Set(),     // O(1) set of selected email IDs
    emails: [],                 // emails returned by backend API
    stats: null,                // live arena statistics from /api/stats
    player: null,               // player progress from /api/progress
    isLoading: false,
    hasSeenVictory: false,      // prevents duplicate modal popup on same session

    // RPG & Combat State
    activeBossState: "idle",    // "idle" | "hit" | "attack" | "low-hp" | "defeat"
    isAnimatingCombat: false,   // prevents rapid double-triggers from corrupting UI
    readingEmailId: null,       // ID of email currently open in reader panel
    soundEnabled: true,
    soundVolume: 0.7,
    motionEnabled: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  };

  /* ─────────────────────────────────────────────────────────────
     2. PROCEDURAL WEB AUDIO SYNTHESIZER (SoundFX)
     ───────────────────────────────────────────────────────────── */
  class SoundFX {
    constructor() {
      this.ctx = null;
      this.masterGain = null;
      this.initialized = false;
    }

    init() {
      if (this.initialized) return;
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        this.ctx = new AudioContextClass();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(state.soundVolume, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);
        this.initialized = true;
      } catch (err) {
        console.warn("Web Audio not supported:", err);
      }
    }

    setVolume(val) {
      state.soundVolume = Math.max(0, Math.min(1, val));
      if (this.masterGain && this.ctx) {
        this.masterGain.gain.setValueAtTime(state.soundVolume, this.ctx.currentTime);
      }
    }

    toggleSound() {
      state.soundEnabled = !state.soundEnabled;
      return state.soundEnabled;
    }

    // Play short synthesized beep / tone
    playTone(freq, type = "sine", duration = 0.15, gainPeak = 0.3) {
      if (!state.soundEnabled) return;
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === "suspended") this.ctx.resume();

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

      gain.gain.setValueAtTime(0, this.ctx.currentTime);
      gain.gain.linearRampToValueAtTime(gainPeak, this.ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    }

    // Attack Whoosh / Spell Cast
    playAttack(type = "slash") {
      if (!state.soundEnabled) return;
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === "suspended") this.ctx.resume();

      const t0 = this.ctx.currentTime;

      if (type === "slash") {
        // Melee slash: saw sweep downward
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(800, t0);
        osc.frequency.exponentialRampToValueAtTime(120, t0 + 0.22);

        gain.gain.setValueAtTime(0.3, t0);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.25);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(t0);
        osc.stop(t0 + 0.25);

      } else if (type === "lightning") {
        // Crackling lightning: high square wave modulation
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "square";
        osc.frequency.setValueAtTime(1200, t0);
        osc.frequency.linearRampToValueAtTime(240, t0 + 0.3);

        gain.gain.setValueAtTime(0.25, t0);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.32);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(t0);
        osc.stop(t0 + 0.32);

      } else if (type === "blast") {
        // Stun blast / bomb: punchy sweep with low noise
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(450, t0);
        osc.frequency.exponentialRampToValueAtTime(45, t0 + 0.35);

        gain.gain.setValueAtTime(0.4, t0);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.38);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(t0);
        osc.stop(t0 + 0.38);

      } else if (type === "holy") {
        // Holy Aegis: harmonic triad arpeggio
        const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
        notes.forEach((freq, idx) => {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(freq, t0 + idx * 0.08);

          gain.gain.setValueAtTime(0, t0 + idx * 0.08);
          gain.gain.linearRampToValueAtTime(0.22, t0 + idx * 0.08 + 0.03);
          gain.gain.exponentialRampToValueAtTime(0.001, t0 + idx * 0.08 + 0.35);

          osc.connect(gain);
          gain.connect(this.masterGain);
          osc.start(t0 + idx * 0.08);
          osc.stop(t0 + idx * 0.08 + 0.35);
        });
      }
    }

    // Impact / Hit Reaction
    playHit(isCrit = false) {
      if (!state.soundEnabled) return;
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === "suspended") this.ctx.resume();

      const t0 = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = isCrit ? "square" : "triangle";
      osc.frequency.setValueAtTime(isCrit ? 260 : 180, t0);
      osc.frequency.exponentialRampToValueAtTime(40, t0 + (isCrit ? 0.35 : 0.2));

      gain.gain.setValueAtTime(isCrit ? 0.45 : 0.3, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + (isCrit ? 0.35 : 0.2));

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t0);
      osc.stop(t0 + (isCrit ? 0.35 : 0.2));

      if (isCrit) {
        // Extra high bell ringing harmonic for critical hits
        setTimeout(() => this.playTone(1320, "sine", 0.4, 0.25), 40);
      }
    }

    // Monster Defeat Fanfare
    playDefeat(isArenaVictory = false) {
      if (!state.soundEnabled) return;
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === "suspended") this.ctx.resume();

      const t0 = this.ctx.currentTime;

      if (isArenaVictory) {
        // Triumphant RPG Fanfare: 7-note ascending chord progression
        const melody = [523.25, 659.25, 783.99, 1046.5, 987.77, 1046.5, 1318.51];
        melody.forEach((freq, idx) => {
          setTimeout(() => this.playTone(freq, "triangle", 0.35, 0.25), idx * 110);
        });
      } else {
        // Boss Defeated: punchy decrescendo rumble
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(320, t0);
        osc.frequency.exponentialRampToValueAtTime(35, t0 + 0.65);

        gain.gain.setValueAtTime(0.4, t0);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.7);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(t0);
        osc.stop(t0 + 0.7);
      }
    }

    // XP Reward Sound
    playXpGain() {
      setTimeout(() => this.playTone(1046.5, "sine", 0.12, 0.18), 0);
      setTimeout(() => this.playTone(1318.5, "sine", 0.16, 0.22), 80);
    }

    // UI Click feedback
    playClick() {
      this.playTone(720, "sine", 0.05, 0.08);
    }

    // Operation failure
    playError() {
      this.playTone(140, "square", 0.25, 0.2);
    }
  }

  const sound = new SoundFX();

  /* ─────────────────────────────────────────────────────────────
     3. CACHED DOM REFERENCES
     ───────────────────────────────────────────────────────────── */
  const dom = {
    // Nav & Controls
    navLinks: document.querySelector(".nav-links"),
    btnSoundToggle: document.getElementById("btn-sound-toggle"),
    soundIcon: document.getElementById("sound-icon"),
    soundVolume: document.getElementById("sound-volume"),
    btnMotionToggle: document.getElementById("btn-motion-toggle"),
    motionIcon: document.getElementById("motion-icon"),

    // Views
    arenaView: document.getElementById("arena-view"),
    inboxView: document.getElementById("inbox-view"),
    progressView: document.getElementById("progress-view"),

    // Dashboard
    playerLevel: document.getElementById("player-level"),
    playerXpFill: document.getElementById("player-xp-fill"),
    playerXpDetail: document.getElementById("player-xp-detail"),
    dashboardCleaned: document.getElementById("dashboard-cleaned-count"),
    dashboardMonsters: document.getElementById("dashboard-monsters-count"),
    arenaCleanupFill: document.getElementById("arena-cleanup-fill"),
    arenaCleanupDetail: document.getElementById("arena-cleanup-detail"),

    // Arena Grid Monster Cards
    arenaGrid: document.querySelector(".arena-grid"),
    cardSpam: document.getElementById("card-spam-slime"),
    cardNewsletter: document.getElementById("card-newsletter-hydra"),
    cardNotification: document.getElementById("card-notification-goblin"),
    cardGuardian: document.getElementById("card-mail-guardian"),
    btnBackArena: document.getElementById("btn-back-arena"),

    // Card HP & Badges
    hpFillSpam: document.getElementById("hp-fill-spam"),
    hpTextSpam: document.getElementById("hp-text-spam"),
    hpFillNewsletter: document.getElementById("hp-fill-newsletter"),
    hpTextNewsletter: document.getElementById("hp-text-newsletter"),
    hpFillNotification: document.getElementById("hp-fill-notification"),
    hpTextNotification: document.getElementById("hp-text-notification"),
    protectionFillGuardian: document.getElementById("protection-fill-guardian"),
    hpTextGuardian: document.getElementById("hp-text-guardian"),

    // Active Battle Stage
    battleStage: document.getElementById("battle-stage"),
    attackTheater: document.getElementById("attack-theater"),
    bossPedestal: document.getElementById("boss-pedestal"),
    activeBossAvatar: document.getElementById("active-boss-avatar"),
    bossDefeatBanner: document.getElementById("boss-defeat-banner"),

    // Boss HUD & Dual Health Bar
    bossHudCategory: document.getElementById("boss-hud-category"),
    bossHudName: document.getElementById("boss-hud-name"),
    bossStatusPill: document.getElementById("boss-status-pill"),
    bossHpMetricName: document.getElementById("boss-hp-metric-name"),
    bossHpCurrent: document.getElementById("boss-hp-current"),
    bossHpMax: document.getElementById("boss-hp-max"),
    bossHpPct: document.getElementById("boss-hp-pct"),
    bossHpBox: document.querySelector(".boss-hp-box"),
    bossGhostFill: document.getElementById("boss-ghost-fill"),
    bossInstantFill: document.getElementById("boss-instant-fill"),
    bossDangerOverlay: document.getElementById("boss-danger-overlay"),
    bossHudDescription: document.getElementById("boss-hud-description"),
    btnStageAttack: document.getElementById("btn-stage-attack"),
    stageAttackCount: document.getElementById("stage-attack-count"),
    btnToggleLog: document.getElementById("btn-toggle-log"),
    combatLogCount: document.getElementById("combat-log-count"),
    combatLogContainer: document.getElementById("combat-log-container"),
    battleLogStream: document.getElementById("battle-log-stream"),
    btnClearLog: document.getElementById("btn-clear-log"),

    // Header context banner
    battleIcon: document.getElementById("battle-context-icon"),
    battleTitle: document.getElementById("battle-context-title"),
    battleSubtitle: document.getElementById("battle-context-subtitle"),
    guardianNotice: document.getElementById("guardian-notice"),

    // Filter & Search Toolbar
    searchInput: document.getElementById("email-search-input"),
    btnSearchClear: document.getElementById("btn-search-clear"),
    categoryPills: document.getElementById("category-pills"),
    filterStatus: document.getElementById("filter-status"),
    sortDate: document.getElementById("sort-date"),
    btnResetFilters: document.getElementById("btn-reset-filters"),

    // Category count badges
    countAll: document.getElementById("count-all"),
    countSpam: document.getElementById("count-spam"),
    countNewsletter: document.getElementById("count-newsletter"),
    countNotification: document.getElementById("count-notification"),
    countImportant: document.getElementById("count-important"),

    // Selection Controls
    selectAllCheckbox: document.getElementById("select-all-checkbox"),
    visibleCountSpan: document.getElementById("visible-count"),
    selectionSummary: document.getElementById("selection-summary"),
    btnDeselectAll: document.getElementById("btn-deselect-all"),
    btnReviewCleanup: document.getElementById("btn-review-cleanup"),
    btnCleanupCount: document.getElementById("btn-cleanup-count"),

    // Email List & Reader Split
    emailListWrapper: document.getElementById("email-list-wrapper"),
    emailListSplitWrap: document.querySelector(".email-list-split-wrap"),
    emailList: document.getElementById("email-list"),
    emptyState: document.getElementById("email-empty-state"),
    emptyMessage: document.getElementById("empty-state-message"),
    btnEmptyReset: document.getElementById("btn-empty-reset"),

    // Email Reader Panel
    emailReaderPanel: document.getElementById("email-reader-panel"),
    readerIcon: document.getElementById("reader-icon"),
    readerSubject: document.getElementById("reader-subject"),
    readerSender: document.getElementById("reader-sender"),
    readerDate: document.getElementById("reader-date"),
    readerCategoryBadge: document.getElementById("reader-category-badge"),
    readerStatusBadge: document.getElementById("reader-status-badge"),
    readerBodyText: document.getElementById("reader-body-text"),
    btnReaderClose: document.getElementById("btn-reader-close"),
    readerMonsterActions: document.getElementById("reader-monster-actions"),
    readerGuardianActions: document.getElementById("reader-guardian-actions"),
    btnReaderStrike: document.getElementById("btn-reader-strike"),
    readerStrikeAction: document.getElementById("reader-strike-action"),
    btnReaderStar: document.getElementById("btn-reader-star"),
    btnReaderArchive: document.getElementById("btn-reader-archive"),
    btnReaderFollowup: document.getElementById("btn-reader-followup"),

    // Cleanup Modal
    modal: document.getElementById("cleanup-modal"),
    modalClose: document.getElementById("btn-modal-close"),
    modalCancel: document.getElementById("btn-modal-cancel"),
    modalConfirm: document.getElementById("btn-modal-confirm"),
    modalAffectedCount: document.getElementById("modal-affected-count"),
    modalXpReward: document.getElementById("modal-xp-reward"),
    modalConfirmBtnCount: document.getElementById("modal-confirm-btn-count"),
    modalPreviewBody: document.getElementById("modal-preview-body"),

    // Victory Modal
    victoryModal: document.getElementById("victory-modal"),
    btnVictoryClose: document.getElementById("btn-victory-close"),
    victoryCleanedCount: document.getElementById("victory-cleaned-count"),
    victoryXpEarned: document.getElementById("victory-xp-earned"),
    victoryHeroLevel: document.getElementById("victory-hero-level"),

    // Achievements & History Tab
    achievementsGrid: document.getElementById("achievements-grid"),
    historyTableBody: document.getElementById("history-table-body"),
    btnRefreshHistory: document.getElementById("btn-refresh-history"),
  };

  /* ─────────────────────────────────────────────────────────────
     4. MONSTER & CATEGORY METADATA
     ───────────────────────────────────────────────────────────── */
  const CATEGORY_META = {
    all: {
      name: "Grand Arena",
      bossName: "Clutter Legion",
      categoryTag: "Grand Arena",
      icon: "⚔️",
      title: "⚔️ Grand Arena — All Messages",
      subtitle: "Survey and purge clutter across all categories simultaneously.",
      description: "Battle clutter bosses collectively to advance your overall arena clearance.",
      attackType: "slash",
      isGuardian: false,
    },
    spam: {
      name: "Spam Slime",
      bossName: "Spam Slime",
      categoryTag: "Spam Boss",
      icon: "🧪",
      title: "⚔️ Battling Spam Slime (Spam)",
      subtitle: "Purge phishing scams, fake lotteries, and junk mail to dissolve the slime.",
      description: "Purge spam messages to deplete the slime's acidic core and earn +100 Defeat XP.",
      attackType: "slash",
      isGuardian: false,
    },
    newsletter: {
      name: "Newsletter Hydra",
      bossName: "Newsletter Hydra",
      categoryTag: "Hydra Boss",
      icon: "🐉",
      title: "⚔️ Battling Newsletter Hydra (Newsletters)",
      subtitle: "Sever promotional heads, stale coupons, and unread recurring digests.",
      description: "Unsubscribe and purge recurring promos to sever all hydra heads.",
      attackType: "lightning",
      isGuardian: false,
    },
    notification: {
      name: "Notification Goblin",
      bossName: "Notification Goblin",
      categoryTag: "Goblin Boss",
      icon: "👺",
      title: "⚔️ Battling Notification Goblin (Notifications)",
      subtitle: "Silence social alerts, automated pings, and noisy status chatter.",
      description: "Archive automated notification pings to silence the goblin's chaotic bells.",
      attackType: "blast",
      isGuardian: false,
    },
    important: {
      name: "Mail Guardian",
      bossName: "Mail Guardian",
      categoryTag: "Inbox Ally",
      icon: "🛡️",
      title: "🛡️ Mail Guardian Sanctuary (Important)",
      subtitle: "Protect priority tax forms, job offers, contracts, and travel tickets.",
      description: "Safeguard high-value correspondence to expand the Guardian's protective aegis.",
      attackType: "holy",
      isGuardian: true,
    },
  };

  /* ─────────────────────────────────────────────────────────────
     5. API COMMUNICATION LAYER
     ───────────────────────────────────────────────────────────── */
  const api = {
    async getEmails(category, status, search, sort) {
      const params = new URLSearchParams({
        category: category || "all",
        status: status || "all",
        sort: sort || "newest",
      });
      if (search && search.trim()) {
        params.append("search", search.trim());
      }
      const res = await fetch(`/api/emails?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status} fetching emails`);
      const json = await res.json();
      return json.data || [];
    },

    async getStats() {
      const res = await fetch("/api/stats");
      if (!res.ok) throw new Error(`HTTP ${res.status} fetching stats`);
      const json = await res.json();
      return json.data;
    },

    async getProgress() {
      const res = await fetch("/api/progress");
      if (!res.ok) throw new Error(`HTTP ${res.status} fetching progress`);
      const json = await res.json();
      return json.data;
    },

    async getHistory() {
      const res = await fetch("/api/history?limit=25");
      if (!res.ok) throw new Error(`HTTP ${res.status} fetching history`);
      const json = await res.json();
      return json.data || [];
    },

    async previewCleanup(emailIds) {
      const res = await fetch("/api/cleanup/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email_ids: emailIds }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      return await res.json();
    },

    async executeCleanup(emailIds) {
      const res = await fetch("/api/cleanup/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email_ids: emailIds }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || err.error || `HTTP ${res.status}`);
      }
      return await res.json();
    },

    async executeImportantAction(emailId, action) {
      const res = await fetch("/api/important/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email_id: emailId, action }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || err.error || `HTTP ${res.status}`);
      }
      return await res.json();
    },
  };

  /* ─────────────────────────────────────────────────────────────
     6. BATTLE LOG & EVENT BUS
     ───────────────────────────────────────────────────────────── */
  let combatLogEntriesCount = 0;

  function appendCombatLog(message, type = "system") {
    if (!dom.battleLogStream) return;

    combatLogEntriesCount++;
    if (dom.combatLogCount) dom.combatLogCount.textContent = combatLogEntriesCount;

    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const row = document.createElement("div");
    row.className = `log-entry log-${type}`;
    row.innerHTML = `<span style="color: var(--text-dim); font-size: 0.68rem;">[${time}]</span> ${escapeHtml(message)}`;

    dom.battleLogStream.appendChild(row);
    dom.battleLogStream.scrollTop = dom.battleLogStream.scrollHeight;
  }

  /* ─────────────────────────────────────────────────────────────
     7. COMBAT VISUAL FX & PARTICLE THEATER
     ───────────────────────────────────────────────────────────── */

  // Spawns floating combat numbers (Damage, XP, Critical)
  function spawnFloatingNumber(text, className, targetEl) {
    if (!state.motionEnabled || !targetEl) return;

    const rect = targetEl.getBoundingClientRect();
    const el = document.createElement("div");
    el.className = `floating-number ${className}`;
    el.textContent = text;

    const x = rect.left + rect.width / 2 + (Math.random() * 24 - 12);
    const y = rect.top + rect.height / 3;

    el.style.left = `${Math.max(10, x)}px`;
    el.style.top = `${Math.max(10, y)}px`;

    document.body.appendChild(el);
    el.addEventListener("animationend", () => el.remove());
  }

  // Spawns burst of directional particles on monster impact
  function spawnCombatParticles(targetEl, category = "spam", count = 14, isCrit = false) {
    if (!state.motionEnabled || !targetEl) return;

    const rect = targetEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    const colorPalettes = {
      spam: ["#4ade80", "#22c55e", "#86efac", "#15803d"],
      newsletter: ["#c084fc", "#a855f7", "#7e22ce", "#e9d5ff"],
      notification: ["#fbbf24", "#f59e0b", "#fde68a", "#d97706"],
      important: ["#38bdf8", "#35d6c2", "#7dd3fc", "#ffd700"],
    };
    const palette = isCrit ? ["#ff6577", "#ffd700", "#ffffff", "#ff8533"] : (colorPalettes[category] || colorPalettes.spam);

    for (let i = 0; i < count; i++) {
      const p = document.createElement("div");
      p.className = "combat-particle";

      const angle = (Math.PI * 2 * i) / count + (Math.random() * 0.4 - 0.2);
      const distance = isCrit ? Math.random() * 70 + 40 : Math.random() * 50 + 25;
      const dx = Math.cos(angle) * distance;
      const dy = Math.sin(angle) * distance;

      const size = Math.random() * 7 + 4;
      p.style.width = `${size}px`;
      p.style.height = `${size}px`;
      p.style.background = palette[Math.floor(Math.random() * palette.length)];
      p.style.left = `${cx}px`;
      p.style.top = `${cy}px`;
      p.style.setProperty("--p-dx", `${dx}px`);
      p.style.setProperty("--p-dy", `${dy}px`);

      document.body.appendChild(p);
      p.addEventListener("animationend", () => p.remove());
    }
  }

  // Spawns traveling spell / projectile inside attack theater
  function spawnAttackTheaterSpell(attackType = "slash") {
    if (!state.motionEnabled || !dom.attackTheater) return;

    const spell = document.createElement("div");
    if (attackType === "slash") {
      spell.className = "spell-slash-effect";
    } else if (attackType === "lightning") {
      spell.className = "spell-lightning-effect";
    } else if (attackType === "blast") {
      spell.className = "spell-blast-effect";
    } else if (attackType === "holy") {
      spell.className = "spell-holy-effect";
    }

    dom.attackTheater.appendChild(spell);
    spell.addEventListener("animationend", () => spell.remove());
  }

  // Updates monster avatar visual state (idle | hit | attack | low-hp | defeat)
  function setMonsterCharacterState(category, stateName) {
    state.activeBossState = stateName;

    // 1. Update in-stage active boss avatar
    const avatarEl = dom.activeBossAvatar?.querySelector(".monster-art");
    if (avatarEl) {
      avatarEl.classList.remove("state-idle", "state-hit", "state-attack", "state-low-hp", "state-defeat");
      avatarEl.classList.add(`state-${stateName}`);
    }

    // 2. Also update corresponding card in arena grid
    const cardMap = {
      spam: dom.cardSpam,
      newsletter: dom.cardNewsletter,
      notification: dom.cardNotification,
      important: dom.cardGuardian,
    };
    const card = cardMap[category];
    if (card) {
      const art = card.querySelector(".monster-art");
      if (art) {
        art.classList.remove("state-idle", "state-hit", "state-attack", "state-low-hp", "state-defeat");
        art.classList.add(`state-${stateName}`);
      }
    }
  }

  // Renders the appropriate monster HTML artwork inside active boss avatar
  function renderActiveBossArt(category, stateName = "idle") {
    if (!dom.activeBossAvatar) return;

    let artHtml = "";
    if (category === "spam") {
      artHtml = `
        <div class="monster-art slime-art state-${stateName}">
          <div class="slime-body">
            <div class="slime-eye left"></div>
            <div class="slime-eye right"></div>
            <div class="slime-mouth"></div>
          </div>
          <div class="slime-drip drip1"></div>
          <div class="slime-drip drip2"></div>
        </div>
      `;
    } else if (category === "newsletter") {
      artHtml = `
        <div class="monster-art hydra-art state-${stateName}">
          <div class="hydra-head head-left"></div>
          <div class="hydra-head head-center"></div>
          <div class="hydra-head head-right"></div>
          <div class="hydra-body"></div>
        </div>
      `;
    } else if (category === "notification") {
      artHtml = `
        <div class="monster-art goblin-art state-${stateName}">
          <div class="goblin-body">
            <div class="goblin-ear left"></div>
            <div class="goblin-ear right"></div>
            <div class="goblin-eye left"></div>
            <div class="goblin-eye right"></div>
            <div class="goblin-nose"></div>
            <div class="goblin-grin"></div>
          </div>
        </div>
      `;
    } else if (category === "important") {
      artHtml = `
        <div class="monster-art guardian-art state-${stateName === "hit" ? "protect" : stateName}">
          <div class="guardian-shield">
            <div class="shield-emblem"></div>
          </div>
          <div class="guardian-helmet">
            <div class="helmet-visor"></div>
          </div>
        </div>
      `;
    } else {
      artHtml = `
        <div class="monster-art grand-arena-art state-idle">
          <div style="font-size: 4.5rem; filter: drop-shadow(0 0 24px rgba(145,102,245,0.8));">🏟️</div>
        </div>
      `;
    }

    dom.activeBossAvatar.innerHTML = artHtml;
  }

  // Updates dual health bar with instant bar + delayed ghost trail
  function updateBossDualHealthBar(category, currentHp, maxHp, isInstant = false) {
    if (!dom.bossInstantFill || !dom.bossGhostFill) return;

    const pct = maxHp > 0 ? Math.max(0, Math.min(100, Math.round((currentHp / maxHp) * 100))) : 0;

    if (dom.bossHpCurrent) dom.bossHpCurrent.textContent = currentHp;
    if (dom.bossHpMax) dom.bossHpMax.textContent = maxHp;
    if (dom.bossHpPct) dom.bossHpPct.textContent = `${pct}%`;

    // Apply color class to instant fill
    dom.bossInstantFill.className = `hp-instant-fill hp-${category}`;

    if (isInstant) {
      dom.bossInstantFill.style.transition = "none";
      dom.bossGhostFill.style.transition = "none";
      dom.bossInstantFill.style.width = `${pct}%`;
      dom.bossGhostFill.style.width = `${pct}%`;
      void dom.bossInstantFill.offsetWidth;
      dom.bossInstantFill.style.transition = "";
      dom.bossGhostFill.style.transition = "";
    } else {
      // 1. Instant fill moves right away
      dom.bossInstantFill.style.width = `${pct}%`;
      // 2. Ghost fill catches up smoothly with a 300ms delay (via CSS transition)
      dom.bossGhostFill.style.width = `${pct}%`;
    }

    // Low-HP Visual Warning (< 30% HP)
    if (dom.bossHpBox) {
      if (pct <= 30 && currentHp > 0) {
        dom.bossHpBox.classList.add("low-hp");
      } else {
        dom.bossHpBox.classList.remove("low-hp");
      }
    }

    // Vanquished state display
    if (dom.bossDefeatBanner) {
      dom.bossDefeatBanner.style.display = currentHp === 0 ? "block" : "none";
    }
  }

  /* ─────────────────────────────────────────────────────────────
     8. BATTLE STAGE SYNCHRONIZATION
     ───────────────────────────────────────────────────────────── */
  function syncBattleStage(category) {
    const meta = CATEGORY_META[category] || CATEGORY_META.all;

    if (dom.bossHudCategory) dom.bossHudCategory.textContent = meta.categoryTag;
    if (dom.bossHudName) dom.bossHudName.textContent = meta.bossName;
    if (dom.bossHudDescription) dom.bossHudDescription.textContent = meta.description;

    if (dom.bossHpMetricName) {
      dom.bossHpMetricName.textContent = meta.isGuardian ? "Sanctuary Aegis:" : "Boss Vitality:";
    }

    let current = 15;
    let max = 15;
    let isDefeated = false;

    if (state.stats?.monsters) {
      if (category === "spam") {
        current = state.stats.monsters.spam_slime.current_hp;
        max = state.stats.monsters.spam_slime.max_hp;
        isDefeated = state.stats.monsters.spam_slime.defeated;
      } else if (category === "newsletter") {
        current = state.stats.monsters.newsletter_hydra.current_hp;
        max = state.stats.monsters.newsletter_hydra.max_hp;
        isDefeated = state.stats.monsters.newsletter_hydra.defeated;
      } else if (category === "notification") {
        current = state.stats.monsters.notification_goblin.current_hp;
        max = state.stats.monsters.notification_goblin.max_hp;
        isDefeated = state.stats.monsters.notification_goblin.defeated;
      } else if (category === "important") {
        current = state.stats.monsters.mail_guardian.protected;
        max = state.stats.monsters.mail_guardian.total_important;
      } else {
        // "all" summary
        current = (state.stats.monsters.spam_slime.current_hp +
                   state.stats.monsters.newsletter_hydra.current_hp +
                   state.stats.monsters.notification_goblin.current_hp);
        max = 42;
        isDefeated = state.stats.arena_cleared;
      }
    }

    // Status pill
    if (dom.bossStatusPill) {
      if (meta.isGuardian) {
        dom.bossStatusPill.textContent = "🛡️ Protected Sanctuary";
        dom.bossStatusPill.style.color = "var(--teal)";
      } else if (isDefeated) {
        dom.bossStatusPill.textContent = "☠️ Vanquished";
        dom.bossStatusPill.style.color = "var(--red)";
      } else {
        dom.bossStatusPill.textContent = "⚔️ Active Boss";
        dom.bossStatusPill.style.color = "var(--gold)";
      }
    }

    const initialAnim = isDefeated ? "defeat" : (current <= (max * 0.3) && !meta.isGuardian ? "low-hp" : "idle");
    renderActiveBossArt(category, initialAnim);
    updateBossDualHealthBar(category, current, max, true);
  }

  /* ─────────────────────────────────────────────────────────────
     9. INTERACTIVE IN-ARENA EMAIL READER PANEL
     ───────────────────────────────────────────────────────────── */

  // Realistic sanitized message generator for preview bodies
  function generateRealisticEmailBody(email) {
    if (!email) return "";
    const subject = email.subject || "Message";
    const preview = email.preview || "";
    const sender = email.sender || "System";
    const senderEmail = email.sender_email || "no-reply@domain.com";

    if (email.category === "spam") {
      return `[SECURITY WARNING: HIGH PHISHING RISK DETECTED]

From: ${sender} <${senderEmail}>
Subject: ${subject}

${preview}

Kindly reply immediately with your full banking credentials, Social Security number, and passport photo to facilitate the wire clearance. Failure to respond within 24 hours will forfeit your transfer rights permanently.

Regards,
Foreign Treasury Disbursements Office`;

    } else if (email.category === "newsletter") {
      return `Weekly Digest: ${subject}
Publisher: ${sender}

${preview}

In this edition:
• Top 10 productivity hacks for 2026
• AI workflow automation trends
• Exclusive promo code: HYDRA90 for 90% off annual memberships!

---
To unsubscribe or modify subscription preferences, click here or purge this newsletter to vanquish the Hydra.`;

    } else if (email.category === "notification") {
      return `Automated Alert Notification
Service: ${sender}

${preview}

Timestamp: ${email.received_at || new Date().toISOString()}
Status: Event triggered in repository / workspace.
Action Required: Check your notification preferences to silence repetitive reminders.`;

    } else {
      return `IMPORTANT / PRIORITY CORRESPONDENCE
From: ${sender} <${senderEmail}>
Priority: High / Flagged by Guardian

${preview}

Please find attached the official documentation and confirmation details. Please safeguard this receipt in your vault or mark for follow-up if further action is required.

Best regards,
${sender}`;
    }
  }

  function openEmailReader(emailId) {
    const email = state.emails.find((e) => String(e.id) === String(emailId));
    if (!email) return;

    state.readingEmailId = emailId;
    sound.playClick();

    if (dom.readerSubject) dom.readerSubject.textContent = email.subject;
    if (dom.readerSender) dom.readerSender.textContent = `${email.sender} (${email.sender_email || ""})`;
    if (dom.readerDate) dom.readerDate.textContent = formatShortDate(email.received_at || email.created_at);

    if (dom.readerCategoryBadge) {
      dom.readerCategoryBadge.className = `monster-category cat-${email.category}`;
      dom.readerCategoryBadge.textContent = capitalize(email.category);
    }

    if (dom.readerStatusBadge) {
      dom.readerStatusBadge.className = `status-badge status-${email.status}`;
      dom.readerStatusBadge.textContent = capitalize(email.status);
    }

    if (dom.readerBodyText) {
      dom.readerBodyText.textContent = generateRealisticEmailBody(email);
    }

    // Toggle Action Buttons based on category
    if (email.category === "important") {
      if (dom.readerMonsterActions) dom.readerMonsterActions.style.display = "none";
      if (dom.readerGuardianActions) dom.readerGuardianActions.style.display = "flex";
    } else {
      if (dom.readerMonsterActions) dom.readerMonsterActions.style.display = "flex";
      if (dom.readerGuardianActions) dom.readerGuardianActions.style.display = "none";
      if (dom.readerStrikeAction) {
        dom.readerStrikeAction.textContent = email.status === "archived" ? "Already Purged" : "Purge & Strike";
      }
      if (dom.btnReaderStrike) {
        if (email.status === "archived") {
          dom.btnReaderStrike.setAttribute("disabled", "true");
        } else {
          dom.btnReaderStrike.removeAttribute("disabled");
        }
      }
    }

    // Slide open reader panel
    if (dom.emailListSplitWrap) dom.emailListSplitWrap.classList.add("with-reader");
    if (dom.emailReaderPanel) dom.emailReaderPanel.style.display = "flex";

    // Highlight row in list
    document.querySelectorAll(".email-row").forEach((r) => {
      r.classList.toggle("reading-active", r.dataset.id === String(emailId));
    });
  }

  function closeEmailReader() {
    state.readingEmailId = null;
    if (dom.emailListSplitWrap) dom.emailListSplitWrap.classList.remove("with-reader");
    if (dom.emailReaderPanel) dom.emailReaderPanel.style.display = "none";
    document.querySelectorAll(".email-row").forEach((r) => r.classList.remove("reading-active"));
  }

  if (dom.btnReaderClose) {
    dom.btnReaderClose.addEventListener("click", closeEmailReader);
  }

  /* ─────────────────────────────────────────────────────────────
     10. FULL COMBAT SEQUENCE ORCHESTRATION
     ───────────────────────────────────────────────────────────── */

  // Executes the complete animated player attack -> monster hit -> floating numbers -> HP bar drop
  async function runCombatAttackSequence(category, emailCount, apiResult) {
    if (state.isAnimatingCombat) return;
    state.isAnimatingCombat = true;

    const meta = CATEGORY_META[category] || CATEGORY_META.all;
    const isCrit = emailCount >= 3;
    const attackType = isCrit ? "blast" : meta.attackType;

    // 1. Play Attack Sound & Spell Projectile in Attack Theater
    sound.playAttack(attackType);
    spawnAttackTheaterSpell(attackType);

    appendCombatLog(
      isCrit
        ? `⚡ CRITICAL STRIKE! Hero casts Mega Purge against ${meta.name} with ${emailCount} emails!`
        : `⚔️ Hero unleashes ${attackType.toUpperCase()} strike upon ${meta.name} (${emailCount} email(s))!`,
      isCrit ? "crit" : "system"
    );

    // 2. Wait for projectile travel time (~260ms) before impact
    await new Promise((resolve) => setTimeout(resolve, 260));

    // 3. Impact Timing: Sound, White Flash, Hit Recoil & Particles
    sound.playHit(isCrit);
    setMonsterCharacterState(category, "hit");

    const targetEl = dom.activeBossAvatar || dom.bossPedestal;
    spawnCombatParticles(targetEl, category, isCrit ? 22 : 14, isCrit);

    // Trigger card shake on arena card as well
    const cardMap = {
      spam: dom.cardSpam,
      newsletter: dom.cardNewsletter,
      notification: dom.cardNotification,
      important: dom.cardGuardian,
    };
    if (cardMap[category]) {
      cardMap[category].classList.remove("monster-damage-shake");
      void cardMap[category].offsetWidth;
      cardMap[category].classList.add("monster-damage-shake");
    }

    // 4. Floating Damage Number
    const damageText = isCrit ? `CRITICAL! -${emailCount} HP` : `-${emailCount} HP`;
    spawnFloatingNumber(damageText, isCrit ? "floating-critical" : "floating-damage", targetEl);
    appendCombatLog(`💥 ${meta.name} suffers ${emailCount} damage!`, isCrit ? "crit" : "damage");

    // 5. Dual Health Bar Animation
    let newHp = 0;
    let maxHp = 15;
    if (apiResult.stats?.monsters) {
      if (category === "spam") {
        newHp = apiResult.stats.monsters.spam_slime.current_hp;
        maxHp = apiResult.stats.monsters.spam_slime.max_hp;
      } else if (category === "newsletter") {
        newHp = apiResult.stats.monsters.newsletter_hydra.current_hp;
        maxHp = apiResult.stats.monsters.newsletter_hydra.max_hp;
      } else if (category === "notification") {
        newHp = apiResult.stats.monsters.notification_goblin.current_hp;
        maxHp = apiResult.stats.monsters.notification_goblin.max_hp;
      } else {
        newHp = apiResult.stats.monsters.spam_slime.current_hp +
                apiResult.stats.monsters.newsletter_hydra.current_hp +
                apiResult.stats.monsters.notification_goblin.current_hp;
        maxHp = 42;
      }
    }
    updateBossDualHealthBar(category, newHp, maxHp, false);

    // 6. XP Gain Rewards
    await new Promise((resolve) => setTimeout(resolve, 300));
    sound.playXpGain();
    spawnFloatingNumber(`+${apiResult.xp_awarded} XP`, "floating-xp", dom.playerXpFill || targetEl);
    appendCombatLog(`✨ Gained +${apiResult.xp_awarded} XP! Total Cleaned: ${apiResult.player?.total_emails_cleaned || 0}`, "xp");

    // 7. Check Monster Defeat
    if (apiResult.monster_defeated && apiResult.defeated_monsters?.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      sound.playDefeat(false);
      setMonsterCharacterState(category, "defeat");
      appendCombatLog(`☠️ BOSS DEFEATED: ${apiResult.defeated_monsters.join(", ")}! (+100 Defeat Bonus XP)`, "defeat");
      showToast(`🏆 Boss Defeated: ${apiResult.defeated_monsters.join(", ")}!`);
    } else {
      // Return to Idle or Low-HP state
      setTimeout(() => {
        const nextState = (newHp <= (maxHp * 0.3) && newHp > 0) ? "low-hp" : "idle";
        setMonsterCharacterState(category, nextState);
      }, 350);
    }

    // 8. Check Arena Cleared Victory
    if (apiResult.arena_victory || apiResult.arena_cleared) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      sound.playDefeat(true);
      appendCombatLog(`👑 ARENA CLEARED! All clutter monsters vanquished! (+250 Champion Bonus XP)`, "crit");
      triggerArenaVictoryModal(
        apiResult.player?.total_emails_cleaned || 0,
        apiResult.bonus_xp || 250,
        apiResult.player?.level || 5
      );
    }

    state.isAnimatingCombat = false;
  }

  // Executes animated guardian protection sequence
  async function runGuardianProtectionSequence(actionName, emailSubject, apiResult) {
    if (state.isAnimatingCombat) return;
    state.isAnimatingCombat = true;

    sound.playAttack("holy");
    spawnAttackTheaterSpell("holy");

    setMonsterCharacterState("important", "protect");
    const targetEl = dom.activeBossAvatar || dom.bossPedestal;
    spawnCombatParticles(targetEl, "important", 16, false);

    appendCombatLog(`🛡️ Mail Guardian performs [${actionName.toUpperCase()}] on "${emailSubject.slice(0, 24)}…"`, "protect");

    await new Promise((resolve) => setTimeout(resolve, 300));
    sound.playXpGain();
    spawnFloatingNumber("+15 XP", "floating-xp", targetEl);
    appendCombatLog(`✨ Guardian Sanctuary fortified! (+15 XP)`, "xp");

    // Update guardian protection gauge
    if (apiResult.stats?.monsters?.mail_guardian) {
      const g = apiResult.stats.monsters.mail_guardian;
      updateBossDualHealthBar("important", g.protected, g.total_important, false);
    }

    setTimeout(() => {
      setMonsterCharacterState("important", "idle");
      state.isAnimatingCombat = false;
    }, 450);
  }

  function triggerArenaVictoryModal(totalCleaned, xpEarned, heroLevel) {
    if (dom.victoryCleanedCount) dom.victoryCleanedCount.textContent = totalCleaned;
    if (dom.victoryXpEarned) dom.victoryXpEarned.textContent = `+${xpEarned} XP`;
    if (dom.victoryHeroLevel) dom.victoryHeroLevel.textContent = heroLevel;
    if (dom.victoryModal) dom.victoryModal.style.display = "grid";
  }

  /* ─────────────────────────────────────────────────────────────
     11. DATA RENDERING & SYNCHRONIZATION
     ───────────────────────────────────────────────────────────── */
  function renderDashboard() {
    if (!state.player || !state.stats) return;

    if (dom.playerLevel) dom.playerLevel.textContent = state.player.level;
    if (dom.dashboardCleaned) dom.dashboardCleaned.textContent = state.player.total_emails_cleaned;

    const monstersDefeated = state.stats.monsters_defeated || 0;
    if (dom.dashboardMonsters) dom.dashboardMonsters.textContent = monstersDefeated;

    const currentLvlXp = state.player.current_level_xp ?? (state.player.xp % 500);
    const xpPct = state.player.xp_percentage ?? Math.min(100, Math.round((currentLvlXp / 500) * 100));

    if (dom.playerXpFill) {
      dom.playerXpFill.style.width = `${xpPct}%`;
      dom.playerXpFill.dataset.value = xpPct;
    }
    if (dom.playerXpDetail) {
      dom.playerXpDetail.textContent = `${currentLvlXp} / 500 XP (Total: ${state.player.xp})`;
    }

    const cleanupPct = state.stats.overall_cleanup_percentage ?? 0;
    if (dom.arenaCleanupFill) {
      dom.arenaCleanupFill.style.width = `${cleanupPct}%`;
      dom.arenaCleanupFill.dataset.value = cleanupPct;
    }
    if (dom.arenaCleanupDetail) {
      dom.arenaCleanupDetail.textContent = `${cleanupPct}% complete (${monstersDefeated}/3 bosses defeated)`;
    }
  }

  function renderMonsterCards() {
    if (!state.stats || !state.stats.monsters) return;
    const m = state.stats.monsters;

    // 1. Spam Slime
    if (dom.hpTextSpam) dom.hpTextSpam.textContent = `${m.spam_slime.current_hp}/${m.spam_slime.max_hp}`;
    if (dom.hpFillSpam) dom.hpFillSpam.style.width = `${m.spam_slime.hp_percent}%`;
    updateMonsterDefeatOverlay(dom.cardSpam, m.spam_slime.defeated);

    // 2. Newsletter Hydra
    if (dom.hpTextNewsletter) dom.hpTextNewsletter.textContent = `${m.newsletter_hydra.current_hp}/${m.newsletter_hydra.max_hp}`;
    if (dom.hpFillNewsletter) dom.hpFillNewsletter.style.width = `${m.newsletter_hydra.hp_percent}%`;
    updateMonsterDefeatOverlay(dom.cardNewsletter, m.newsletter_hydra.defeated);

    // 3. Notification Goblin
    if (dom.hpTextNotification) dom.hpTextNotification.textContent = `${m.notification_goblin.current_hp}/${m.notification_goblin.max_hp}`;
    if (dom.hpFillNotification) dom.hpFillNotification.style.width = `${m.notification_goblin.hp_percent}%`;
    updateMonsterDefeatOverlay(dom.cardNotification, m.notification_goblin.defeated);

    // 4. Mail Guardian
    if (dom.hpTextGuardian) dom.hpTextGuardian.textContent = `${m.mail_guardian.protection_percent}%`;
    if (dom.protectionFillGuardian) dom.protectionFillGuardian.style.width = `${m.mail_guardian.protection_percent}%`;

    // Also sync the active battle stage HUD
    syncBattleStage(state.activeCategory);
  }

  function updateMonsterDefeatOverlay(cardEl, isDefeated) {
    if (!cardEl) return;
    cardEl.classList.toggle("defeated", isDefeated);
    const overlay = cardEl.querySelector(".monster-defeat-overlay");
    if (overlay) overlay.style.display = isDefeated ? "block" : "none";

    const btn = cardEl.querySelector(".btn-battle");
    if (btn) {
      if (isDefeated) {
        btn.classList.add("btn-disabled");
        btn.textContent = "✓ Defeated";
      } else {
        btn.classList.remove("btn-disabled");
        btn.textContent = "⚔️ Enter Battle";
      }
    }
  }

  function renderCategoryPillCounts() {
    if (!state.stats || !state.stats.counts) return;
    const c = state.stats.counts;

    if (dom.countSpam) dom.countSpam.textContent = c.spam.pending;
    if (dom.countNewsletter) dom.countNewsletter.textContent = c.newsletter.pending;
    if (dom.countNotification) dom.countNotification.textContent = c.notification.pending;
    if (dom.countImportant) dom.countImportant.textContent = c.important.pending;

    const totalAllPending = c.spam.pending + c.newsletter.pending + c.notification.pending + c.important.pending;
    if (dom.countAll) dom.countAll.textContent = totalAllPending;

    document.querySelectorAll("[data-cat-count]").forEach((el) => {
      const cat = el.dataset.catCount;
      if (c[cat]) el.textContent = c[cat].pending;
    });
  }

  function renderEmailList() {
    const emails = state.emails;
    dom.visibleCountSpan.textContent = emails.length;

    if (emails.length === 0) {
      dom.emailList.innerHTML = "";
      dom.emptyState.style.display = "block";
      updateSelectionUI();
      return;
    }

    dom.emptyState.style.display = "none";

    const rowsHtml = emails
      .map((email) => {
        const isSelected = state.selectedIds.has(email.id);
        const isStarred = email.status === "starred";
        const isCleaned = email.status === "archived" || email.status === "spam";
        const isProtected = email.status === "starred" || email.status === "follow_up";
        const isReading = state.readingEmailId === String(email.id);

        let statusClass = "";
        if (isCleaned) statusClass = "status-cleaned";
        else if (isProtected) statusClass = "status-protected";

        const catBadgeClasses = {
          spam: "cat-spam",
          newsletter: "cat-newsletter",
          notification: "cat-notification",
          important: "cat-important",
        };
        const catClass = catBadgeClasses[email.category] || "";

        let actionColHtml = "";
        if (isCleaned) {
          actionColHtml = `<span class="status-badge status-cleaned-badge">✓ Processed</span>`;
        } else if (isProtected) {
          actionColHtml = `<span class="status-badge status-protected-badge">🛡️ Protected</span>`;
        } else if (email.category === "important") {
          actionColHtml = `
            <button class="btn-action-icon" data-action="keep" data-id="${email.id}" title="Keep Safe">🛡️</button>
            <button class="btn-action-icon" data-action="archive" data-id="${email.id}" title="Archive">📁</button>
            <button class="btn-action-icon" data-action="follow_up" data-id="${email.id}" title="Follow-up">⏰</button>
          `;
        } else {
          actionColHtml = `<button class="btn-action-inspect" data-action="read" data-id="${email.id}" title="Inspect Message">📜 Read</button>`;
        }

        return `
          <div class="email-row ${isSelected ? "selected" : ""} ${statusClass} ${isReading ? "reading-active" : ""}" data-id="${email.id}" role="row">
            <div class="email-check">
              <input type="checkbox" data-checkbox-id="${email.id}" ${isSelected ? "checked" : ""} aria-label="Select email">
            </div>

            <button class="email-star ${isStarred ? "starred" : ""}" data-star-id="${email.id}" title="${isStarred ? "Unstar" : "Star"}">
              ${isStarred ? "★" : "☆"}
            </button>

            <div class="email-sender-col" data-action="read" data-id="${email.id}">
              <span class="email-sender-name" title="${escapeHtml(email.sender)}">${escapeHtml(email.sender)}</span>
              <span class="email-sender-address" title="${escapeHtml(email.sender_email || "")}">${escapeHtml(email.sender_email || "")}</span>
            </div>

            <div class="email-body-col" data-action="read" data-id="${email.id}">
              <span class="email-subject" title="${escapeHtml(email.subject)}">${escapeHtml(email.subject)}</span>
              <span class="email-snippet">${escapeHtml(email.preview || "")}</span>
            </div>

            <div class="email-category-col">
              <span class="monster-category ${catClass}">${capitalize(email.category)}</span>
            </div>

            <div class="email-date-col">
              <span>${formatShortDate(email.received_at || email.created_at)}</span>
            </div>

            <div class="email-action-col">
              ${actionColHtml}
            </div>
          </div>
        `;
      })
      .join("");

    dom.emailList.innerHTML = rowsHtml;
    updateSelectionUI();
  }

  function renderAchievements(achievements) {
    if (!dom.achievementsGrid || !Array.isArray(achievements) || achievements.length === 0) return;

    dom.achievementsGrid.innerHTML = achievements
      .map(
        (a) => `
        <div class="achievement-card ${a.unlocked ? "unlocked" : "locked"}">
          <div class="achievement-header">
            <span class="achievement-icon">${a.icon}</span>
            <span class="achievement-badge ${a.unlocked ? "unlocked" : "locked"}">
              ${a.unlocked ? "✓ Unlocked" : "🔒 Locked"}
            </span>
          </div>
          <h4 class="achievement-title">${escapeHtml(a.title)}</h4>
          <p class="achievement-desc">${escapeHtml(a.description)}</p>
          <span class="achievement-progress-text">${escapeHtml(a.progress)}</span>
        </div>
      `
      )
      .join("");
  }

  function renderHistoryTable(events) {
    if (!dom.historyTableBody) return;

    if (!Array.isArray(events) || events.length === 0) {
      dom.historyTableBody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-dim);">No cleanup events recorded yet.</td></tr>`;
      return;
    }

    dom.historyTableBody.innerHTML = events
      .map(
        (e) => `
        <tr>
          <td><code>${formatTimestamp(e.created_at)}</code></td>
          <td><strong>${escapeHtml(e.action)}</strong></td>
          <td><span class="monster-category cat-${e.category}">${capitalize(e.category)}</span></td>
          <td><span class="text-gold">+${e.processed_count} email(s)</span></td>
        </tr>
      `
      )
      .join("");
  }

  function updateSelectionUI() {
    const count = state.selectedIds.size;
    dom.selectionSummary.textContent = `${count} selected`;
    dom.btnCleanupCount.textContent = count;
    if (dom.stageAttackCount) dom.stageAttackCount.textContent = count;

    const isGuardian = state.activeCategory === "important";

    if (count > 0) {
      dom.btnReviewCleanup.removeAttribute("disabled");
      if (dom.btnStageAttack) {
        dom.btnStageAttack.removeAttribute("disabled");
        dom.btnStageAttack.innerHTML = isGuardian
          ? `🛡️ Safeguard Selected (<span id="stage-attack-count">${count}</span>)`
          : `⚔️ Unleash Attack (<span id="stage-attack-count">${count}</span> Selected)`;
      }
      dom.btnDeselectAll.style.display = "inline-block";
    } else {
      dom.btnReviewCleanup.setAttribute("disabled", "true");
      if (dom.btnStageAttack) {
        dom.btnStageAttack.setAttribute("disabled", "true");
        dom.btnStageAttack.innerHTML = isGuardian
          ? `🛡️ Safeguard Selected (<span id="stage-attack-count">0</span>)`
          : `⚔️ Unleash Attack (<span id="stage-attack-count">0</span> Selected)`;
      }
      dom.btnDeselectAll.style.display = "none";
    }

    const visibleEmails = state.emails;
    if (visibleEmails.length === 0) {
      dom.selectAllCheckbox.checked = false;
      dom.selectAllCheckbox.indeterminate = false;
    } else {
      const visibleSelected = visibleEmails.filter((e) => state.selectedIds.has(e.id)).length;
      if (visibleSelected === 0) {
        dom.selectAllCheckbox.checked = false;
        dom.selectAllCheckbox.indeterminate = false;
      } else if (visibleSelected === visibleEmails.length) {
        dom.selectAllCheckbox.checked = true;
        dom.selectAllCheckbox.indeterminate = false;
      } else {
        dom.selectAllCheckbox.checked = false;
        dom.selectAllCheckbox.indeterminate = true;
      }
    }
  }

  function updateHeaderBanner() {
    const meta = CATEGORY_META[state.activeCategory] || CATEGORY_META.all;
    dom.battleIcon.textContent = meta.icon;
    dom.battleTitle.textContent = meta.title;
    dom.battleSubtitle.textContent = meta.subtitle;

    if (meta.isGuardian) {
      dom.guardianNotice.style.display = "flex";
      dom.btnReviewCleanup.innerHTML = `🛡️ Batch Protect (<span id="btn-cleanup-count">${state.selectedIds.size}</span>)`;
    } else {
      dom.guardianNotice.style.display = "none";
      dom.btnReviewCleanup.innerHTML = `⚡ Review Cleanup (<span id="btn-cleanup-count">${state.selectedIds.size}</span>)`;
    }
    dom.btnCleanupCount = document.getElementById("btn-cleanup-count");
  }

  /* ─────────────────────────────────────────────────────────────
     12. VIEW SWITCHING & NAVIGATION
     ───────────────────────────────────────────────────────────── */
  function switchView(targetView) {
    state.activeView = targetView;
    sound.playClick();

    dom.arenaView.style.display = targetView === "arena" ? "block" : "none";
    dom.inboxView.style.display = targetView === "inbox" ? "block" : "none";
    dom.progressView.style.display = targetView === "progress" ? "block" : "none";

    document.querySelectorAll(".nav-link").forEach((link) => {
      link.classList.toggle("active", link.dataset.section === targetView);
    });

    if (targetView === "inbox") {
      updateHeaderBanner();
      syncBattleStage(state.activeCategory);
      refreshEmails();
      refreshStatsAndProgress();
    } else if (targetView === "arena") {
      refreshStatsAndProgress();
    } else if (targetView === "progress") {
      refreshStatsAndProgress();
      refreshHistory();
    }
  }

  function openCategoryBattle(category) {
    state.activeCategory = category;

    document.querySelectorAll("#category-pills .pill").forEach((pill) => {
      pill.classList.toggle("active", pill.dataset.category === category);
    });

    switchView("inbox");
  }

  /* ─────────────────────────────────────────────────────────────
     13. DATA LOADING & BACKGROUND REFRESH
     ───────────────────────────────────────────────────────────── */
  async function loadInitialData() {
    try {
      state.isLoading = true;
      const [stats, progress, emails] = await Promise.all([
        api.getStats(),
        api.getProgress(),
        api.getEmails(state.activeCategory, state.statusFilter, state.searchQuery, state.dateSort),
      ]);

      state.stats = stats;
      state.player = progress;
      state.emails = emails;

      renderDashboard();
      renderMonsterCards();
      renderCategoryPillCounts();
      renderEmailList();
      renderAchievements(progress.achievements || []);
      syncBattleStage(state.activeCategory);
      appendCombatLog("⚔️ Arena initialized. Select messages to unleash battle strikes!");
    } catch (err) {
      console.error("Error loading initial data:", err);
      showToast(`⚠️ Connection notice: ${err.message}`);
    } finally {
      state.isLoading = false;
    }
  }

  async function refreshEmails() {
    try {
      state.emails = await api.getEmails(
        state.activeCategory,
        state.statusFilter,
        state.searchQuery,
        state.dateSort
      );
      renderEmailList();
    } catch (err) {
      console.error("Error loading emails:", err);
      showToast(`Failed to load emails: ${err.message}`);
    }
  }

  async function refreshStatsAndProgress() {
    try {
      const [stats, progress] = await Promise.all([
        api.getStats(),
        api.getProgress(),
      ]);
      state.stats = stats;
      state.player = progress;

      renderDashboard();
      renderMonsterCards();
      renderCategoryPillCounts();
      renderAchievements(progress.achievements || []);
    } catch (err) {
      console.error("Error refreshing stats:", err);
    }
  }

  async function refreshHistory() {
    try {
      const events = await api.getHistory();
      renderHistoryTable(events);
    } catch (err) {
      console.error("Error refreshing history:", err);
    }
  }

  /* ─────────────────────────────────────────────────────────────
     14. EVENT LISTENERS
     ───────────────────────────────────────────────────────────── */

  // Navigation Links
  dom.navLinks.addEventListener("click", (e) => {
    const link = e.target.closest(".nav-link");
    if (!link) return;
    e.preventDefault();
    const section = link.dataset.section;
    if (section) switchView(section);
  });

  // Sound Controls
  if (dom.btnSoundToggle) {
    dom.btnSoundToggle.addEventListener("click", () => {
      const isEnabled = sound.toggleSound();
      dom.soundIcon.textContent = isEnabled ? "🔊" : "🔇";
      dom.btnSoundToggle.classList.toggle("active", isEnabled);
      showToast(isEnabled ? "Audio FX Enabled" : "Audio FX Muted");
    });
  }

  if (dom.soundVolume) {
    dom.soundVolume.addEventListener("input", (e) => {
      sound.setVolume(parseFloat(e.target.value) / 100);
    });
  }

  // Motion Toggle
  if (dom.btnMotionToggle) {
    dom.btnMotionToggle.addEventListener("click", () => {
      state.motionEnabled = !state.motionEnabled;
      document.body.classList.toggle("reduce-motion", !state.motionEnabled);
      dom.btnMotionToggle.classList.toggle("active", state.motionEnabled);
      showToast(state.motionEnabled ? "Combat FX & Particles: ON" : "Reduced Motion: ACTIVE");
    });
  }

  // Arena Grid Clicks
  dom.arenaGrid.addEventListener("click", (e) => {
    const btn = e.target.closest(".btn");
    const card = e.target.closest(".monster-card");

    if (btn) {
      e.stopPropagation();
      const targetCat = btn.dataset.target || (card && card.dataset.category);
      if (targetCat) {
        const monsterName = card.querySelector(".monster-name").textContent;
        sound.playAttack("slash");
        showToast(
          targetCat === "important"
            ? `Entering Guardian Sanctuary with ${monsterName}…`
            : `Entering battle against ${monsterName}…`
        );
        openCategoryBattle(targetCat);
      }
      return;
    }

    if (card) {
      sound.playClick();
      const wasSelected = card.classList.contains("selected");
      dom.arenaGrid.querySelectorAll(".monster-card").forEach((c) => c.classList.remove("selected"));
      if (!wasSelected) card.classList.add("selected");
    }
  });

  // Back to Arena Button
  dom.btnBackArena.addEventListener("click", () => switchView("arena"));

  // Combat Log Toggle & Clear
  if (dom.btnToggleLog && dom.combatLogContainer) {
    dom.btnToggleLog.addEventListener("click", () => {
      sound.playClick();
      const isVisible = dom.combatLogContainer.style.display !== "none";
      dom.combatLogContainer.style.display = isVisible ? "none" : "flex";
    });
  }

  if (dom.btnClearLog && dom.battleLogStream) {
    dom.btnClearLog.addEventListener("click", () => {
      sound.playClick();
      dom.battleLogStream.innerHTML = `<div class="log-entry log-system">⚔️ Combat event log cleared.</div>`;
      combatLogEntriesCount = 0;
      if (dom.combatLogCount) dom.combatLogCount.textContent = "0";
    });
  }

  // Stage Attack Button (Direct trigger from Boss HUD)
  if (dom.btnStageAttack) {
    dom.btnStageAttack.addEventListener("click", () => {
      if (state.selectedIds.size === 0) return;
      dom.btnReviewCleanup.click();
    });
  }

  // Search input (debounced)
  let searchTimeout = null;
  dom.searchInput.addEventListener("input", (e) => {
    state.searchQuery = e.target.value.trim();
    dom.btnSearchClear.style.display = state.searchQuery ? "block" : "none";

    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      refreshEmails();
    }, 250);
  });

  dom.btnSearchClear.addEventListener("click", () => {
    dom.searchInput.value = "";
    state.searchQuery = "";
    dom.btnSearchClear.style.display = "none";
    refreshEmails();
  });

  // Category Pills
  dom.categoryPills.addEventListener("click", (e) => {
    const pill = e.target.closest(".pill");
    if (!pill) return;

    sound.playClick();
    dom.categoryPills.querySelectorAll(".pill").forEach((p) => p.classList.remove("active"));
    pill.classList.add("active");

    state.activeCategory = pill.dataset.category;
    updateHeaderBanner();
    syncBattleStage(state.activeCategory);
    closeEmailReader();
    refreshEmails();
  });

  // Status Filter & Date Sort
  dom.filterStatus.addEventListener("change", (e) => {
    state.statusFilter = e.target.value;
    refreshEmails();
  });

  dom.sortDate.addEventListener("change", (e) => {
    state.dateSort = e.target.value;
    refreshEmails();
  });

  // Reset Filters
  function resetAllFilters() {
    sound.playClick();
    state.searchQuery = "";
    state.activeCategory = "all";
    state.statusFilter = "pending";
    state.dateSort = "newest";

    dom.searchInput.value = "";
    dom.btnSearchClear.style.display = "none";
    dom.filterStatus.value = "pending";
    dom.sortDate.value = "newest";

    dom.categoryPills.querySelectorAll(".pill").forEach((p) => {
      p.classList.toggle("active", p.dataset.category === "all");
    });

    updateHeaderBanner();
    syncBattleStage("all");
    closeEmailReader();
    refreshEmails();
    showToast("Filters reset to default.");
  }

  dom.btnResetFilters.addEventListener("click", resetAllFilters);
  dom.btnEmptyReset.addEventListener("click", resetAllFilters);

  if (dom.btnRefreshHistory) {
    dom.btnRefreshHistory.addEventListener("click", () => {
      sound.playClick();
      refreshHistory();
    });
  }

  // Select all visible
  dom.selectAllCheckbox.addEventListener("change", (e) => {
    sound.playClick();
    const shouldSelect = e.target.checked;
    state.emails.forEach((email) => {
      if (shouldSelect) {
        state.selectedIds.add(email.id);
      } else {
        state.selectedIds.delete(email.id);
      }
    });
    renderEmailList();
  });

  // Deselect All
  dom.btnDeselectAll.addEventListener("click", () => {
    sound.playClick();
    state.selectedIds.clear();
    renderEmailList();
  });

  // Email List Container (Event Delegation)
  dom.emailList.addEventListener("click", async (e) => {
    const row = e.target.closest(".email-row");
    if (!row) return;

    const emailId = row.dataset.id;
    const email = state.emails.find((item) => String(item.id) === String(emailId));
    if (!email) return;

    // 1. Star click
    const starBtn = e.target.closest(".email-star");
    if (starBtn) {
      e.stopPropagation();
      try {
        const res = await api.executeImportantAction(emailId, "star");
        email.status = email.status === "starred" ? "pending" : "starred";
        starBtn.classList.toggle("starred", email.status === "starred");
        starBtn.innerHTML = email.status === "starred" ? "★" : "☆";

        sound.playXpGain();
        spawnFloatingNumber("+15 XP", "floating-xp", starBtn);
        appendCombatLog(`⭐ Starred "${email.subject.slice(0, 24)}…" (+15 XP)`, "protect");
        showToast(email.status === "starred" ? `Starred "${email.subject.slice(0, 24)}…"` : "Removed star");
        refreshStatsAndProgress();
      } catch (err) {
        sound.playError();
        showToast(`Error starring: ${err.message}`);
      }
      return;
    }

    // 2. Important Action Buttons: Keep, Archive, Follow-up
    const actionBtn = e.target.closest(".btn-action-icon");
    if (actionBtn) {
      e.stopPropagation();
      const actionType = actionBtn.dataset.action;
      try {
        const res = await api.executeImportantAction(emailId, actionType);
        await runGuardianProtectionSequence(actionType, email.subject, res);
        showToast(`🛡️ ${res.message}`);
        await Promise.all([refreshEmails(), refreshStatsAndProgress()]);
      } catch (err) {
        sound.playError();
        showToast(`Error: ${err.message}`);
      }
      return;
    }

    // 3. Inspect / Read Button
    const inspectBtn = e.target.closest(".btn-action-inspect") || e.target.closest("[data-action='read']");
    if (inspectBtn) {
      e.stopPropagation();
      openEmailReader(emailId);
      return;
    }

    // 4. Checkbox click
    const checkbox = e.target.closest("input[type='checkbox']");
    if (checkbox) {
      e.stopPropagation();
      sound.playClick();
      if (checkbox.checked) {
        state.selectedIds.add(emailId);
        row.classList.add("selected");
      } else {
        state.selectedIds.delete(emailId);
        row.classList.remove("selected");
      }
      updateSelectionUI();
      return;
    }

    // 5. Row click: open reader panel and toggle selection
    openEmailReader(emailId);
  });

  // Reader Panel Strike Button (Single Email Battle Strike)
  if (dom.btnReaderStrike) {
    dom.btnReaderStrike.addEventListener("click", async () => {
      if (!state.readingEmailId || state.isAnimatingCombat) return;

      const email = state.emails.find((e) => String(e.id) === String(state.readingEmailId));
      if (!email) return;

      dom.btnReaderStrike.setAttribute("disabled", "true");
      dom.btnReaderStrike.textContent = "Striking…";

      try {
        const result = await api.executeCleanup([email.id]);
        state.selectedIds.delete(email.id);

        await runCombatAttackSequence(email.category, 1, result);
        showToast(`⚔️ Purged "${email.subject.slice(0, 24)}…"`);

        await Promise.all([refreshEmails(), refreshStatsAndProgress()]);
        closeEmailReader();
      } catch (err) {
        sound.playError();
        showToast(`⚠️ Strike failed: ${err.message}`);
      } finally {
        dom.btnReaderStrike.removeAttribute("disabled");
        dom.btnReaderStrike.innerHTML = `⚔️ Strike Monster with Email (<span id="reader-strike-action">Purge</span>)`;
      }
    });
  }

  // Reader Panel Guardian Action Buttons
  async function handleReaderGuardianAction(actionType) {
    if (!state.readingEmailId || state.isAnimatingCombat) return;
    const email = state.emails.find((e) => String(e.id) === String(state.readingEmailId));
    if (!email) return;

    try {
      const res = await api.executeImportantAction(email.id, actionType);
      await runGuardianProtectionSequence(actionType, email.subject, res);
      showToast(`🛡️ ${res.message}`);
      await Promise.all([refreshEmails(), refreshStatsAndProgress()]);
      closeEmailReader();
    } catch (err) {
      sound.playError();
      showToast(`⚠️ Action failed: ${err.message}`);
    }
  }

  if (dom.btnReaderStar) dom.btnReaderStar.addEventListener("click", () => handleReaderGuardianAction("star"));
  if (dom.btnReaderArchive) dom.btnReaderArchive.addEventListener("click", () => handleReaderGuardianAction("archive"));
  if (dom.btnReaderFollowup) dom.btnReaderFollowup.addEventListener("click", () => handleReaderGuardianAction("follow_up"));

  /* ─────────────────────────────────────────────────────────────
     15. CLEANUP PREVIEW & EXECUTION MODAL
     ───────────────────────────────────────────────────────────── */
  dom.btnReviewCleanup.addEventListener("click", async () => {
    if (state.selectedIds.size === 0) return;
    sound.playClick();

    const ids = Array.from(state.selectedIds);

    try {
      showToast("Validating cleanup eligibility on backend…");
      const preview = await api.previewCleanup(ids);
      const data = preview.data;

      if (!data || data.eligible_count === 0) {
        sound.playError();
        showToast("⚠️ Selected emails are not eligible for automated cleanup.");
        return;
      }

      dom.modalAffectedCount.textContent = data.eligible_count;
      dom.modalConfirmBtnCount.textContent = data.eligible_count;
      if (dom.modalXpReward) {
        dom.modalXpReward.textContent = `+${data.xp_reward} XP`;
      }

      dom.modalPreviewBody.innerHTML = data.eligible
        .map(
          (e) => `
          <tr>
            <td><strong>${escapeHtml(e.sender)}</strong></td>
            <td>${escapeHtml(e.subject)}</td>
            <td><span class="monster-category cat-${e.category}">${capitalize(e.category)}</span></td>
            <td><code>${e.proposed_action}</code></td>
          </tr>
        `
        )
        .join("");

      dom.modal.style.display = "grid";
    } catch (err) {
      sound.playError();
      showToast(`Preview failed: ${err.message}`);
    }
  });

  function closeModal() {
    dom.modal.style.display = "none";
  }

  dom.modalClose.addEventListener("click", closeModal);
  dom.modalCancel.addEventListener("click", closeModal);
  dom.modal.addEventListener("click", (e) => {
    if (e.target === dom.modal) closeModal();
  });

  // Victory Modal Close
  if (dom.btnVictoryClose) {
    dom.btnVictoryClose.addEventListener("click", () => {
      sound.playClick();
      dom.victoryModal.style.display = "none";
      switchView("arena");
    });
  }
  if (dom.victoryModal) {
    dom.victoryModal.addEventListener("click", (e) => {
      if (e.target === dom.victoryModal) dom.victoryModal.style.display = "none";
    });
  }

  // Confirm Cleanup: Executes actual backend atomic transaction & triggers battle animation
  dom.modalConfirm.addEventListener("click", async () => {
    const ids = Array.from(state.selectedIds);
    if (ids.length === 0 || state.isAnimatingCombat) return;

    dom.modalConfirm.setAttribute("disabled", "true");
    dom.modalConfirm.textContent = "Executing Combat…";

    try {
      const result = await api.executeCleanup(ids);
      closeModal();
      state.selectedIds.clear();

      // Trigger full RPG combat attack sequence
      const targetCategory = state.activeCategory === "all" ? "all" : state.activeCategory;
      await runCombatAttackSequence(targetCategory, result.processed_count, result);

      showToast(`⚔️ ${result.message}`);
      await Promise.all([refreshEmails(), refreshStatsAndProgress()]);
    } catch (err) {
      sound.playError();
      showToast(`⚠️ Operation failed: ${err.message}`);
    } finally {
      dom.modalConfirm.removeAttribute("disabled");
      dom.modalConfirm.innerHTML = `⚔️ Confirm Cleanup (<span id="modal-confirm-btn-count">0</span>)`;
    }
  });

  /* ─────────────────────────────────────────────────────────────
     16. UTILITIES
     ───────────────────────────────────────────────────────────── */
  function showToast(message) {
    const existing = document.querySelector(".toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;

    Object.assign(toast.style, {
      position: "fixed",
      bottom: "1.5rem",
      left: "50%",
      transform: "translateX(-50%)",
      background: "#1D2030",
      color: "#E8E8F0",
      padding: "0.75rem 1.5rem",
      borderRadius: "8px",
      border: "1px solid #9166F5",
      fontSize: "0.9rem",
      zIndex: "600",
      boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
      opacity: "0",
      transition: "opacity 0.25s, transform 0.25s",
    });

    document.body.appendChild(toast);
    requestAnimationFrame(() => {
      toast.style.opacity = "1";
      toast.style.transform = "translateX(-50%) translateY(-4px)";
    });

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.addEventListener("transitionend", () => toast.remove());
    }, 2600);
  }

  function escapeHtml(str) {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function capitalize(str) {
    if (!str) return "";
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function formatShortDate(dateStr) {
    if (!dateStr) return "";
    try {
      const parts = dateStr.split("T")[0].split(" ")[0].split("-");
      if (parts.length >= 3) {
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const month = months[parseInt(parts[1], 10) - 1] || parts[1];
        return `${month} ${parseInt(parts[2], 10)}`;
      }
    } catch (_) {}
    return dateStr.slice(0, 10);
  }

  function formatTimestamp(tsStr) {
    if (!tsStr) return "Just now";
    try {
      const d = new Date(tsStr);
      if (!isNaN(d.getTime())) {
        return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      }
    } catch (_) {}
    return tsStr.slice(11, 16) || "Recent";
  }

  // Initial Data Load
  loadInitialData();
});
