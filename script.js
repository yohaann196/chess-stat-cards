// ── Helpers ───────────────────────────────────────────────────────────────────

function clamp(n) {
  return Math.min(99, Math.max(1, Math.round(n)));
}

function countInPGN(pgn, regex) {
  return (pgn.match(regex) || []).length;
}

// Scale a raw value (clamped between min/max) to 1–85 range
// Deliberately caps at 85 so rating bonus can push toward 99 but never trivially
function scaleRaw(raw, min, max) {
  const pct = Math.max(0, Math.min(1, (raw - min) / (max - min)));
  return Math.round(pct * 84 + 1); // 1–85
}

// Rating bonus: adds up to 14 points on top of raw score
// 400→+0, 1000→+3, 1500→+6, 2000→+9, 2500→+11, 3000→+13, 3300→+14
function ratingBonus(rating) {
  if (!rating) return 5;
  const pct = Math.max(0, Math.min(1, (rating - 400) / 2900));
  return Math.round(Math.pow(pct, 0.6) * 14);
}

// ── Stat calculation ──────────────────────────────────────────────────────────

function calcStats(games, username, rating) {
  let wins = 0, losses = 0, draws = 0;
  let captures = 0, checks = 0, castles = 0, promotions = 0;
  let moveCounts = [];
  let openings = new Set();
  let resigned = 0; // resigned = calculated the position well enough to quit

  games.forEach(game => {
    const pgn     = game.pgn || "";
    const isWhite = (game.white?.username || "").toLowerCase() === username.toLowerCase();
    const myResult = isWhite ? game.white?.result : game.black?.result;
    const oppResult = isWhite ? game.black?.result : game.white?.result;

    if (myResult === "win")                                                       wins++;
    else if (["checkmated","resigned","timeout","abandoned"].includes(myResult))  losses++;
    else                                                                          draws++;

    if (oppResult === "resigned") resigned++; // opponent resigned to us

    captures   += countInPGN(pgn, /x/g);
    checks     += countInPGN(pgn, /\+/g);
    castles    += countInPGN(pgn, /O-O/g);
    promotions += countInPGN(pgn, /=[QRBN]/g);

    const moveNum = (pgn.match(/\d+\./g) || []).length;
    moveCounts.push(moveNum);

    const openingTag = pgn.match(/\[Opening "([^"]+)"\]/);
    if (openingTag) openings.add(openingTag[1].split(":")[0].trim());

    // Fallback: track first move as opening proxy (e4, d4, Nf3, c4 etc)
    const movesSection = pgn.replace(/\[.*?\]\s*/gs, '').trim();
    const firstMove = movesSection.match(/1\.\s*(\S+)/);
    if (firstMove) openings.add(firstMove[1]);
  });

  const n          = games.length || 1;
  const avgMoves   = moveCounts.reduce((a, b) => a + b, 0) / n;
  const avgCap     = captures / n;
  const avgChecks  = checks / n;
  const castlePct  = (castles / n) * 100;
  const winRate    = (wins / n) * 100;
  const drawRate   = (draws / n) * 100;
  const bonus = ratingBonus(rating);

  // Each stat = raw game signal (1-70) + rating bonus (0-14)
  // Ranges are wide so most players land in the 30-70 zone with clear variation

  // ATK: checks per game (require intent) + captures
  const atkRaw = (avgChecks * 3) + (avgCap * 0.8);
  const ATK = clamp(scaleRaw(atkRaw, 2, 40) + bonus);

  // DEF: castling consistency — 0% to 100%, wide range so rarely-castling players score low
  const DEF = clamp(scaleRaw(castlePct, 0, 100) + bonus);

  // CAL: game length — 8 moves (quick blunder) to 70 (long endgame)
  const CAL = clamp(scaleRaw(avgMoves, 8, 70) + bonus);

  // STR: variety of first moves + draw rate as a proxy for positional play
  // openings.size now always has data (first move fallback), range 1-6 for good spread
  const strRaw = (openings.size * 10) + (drawRate * 0.3);
  const STR = clamp(scaleRaw(strRaw, 10, 70) + bonus);

  // INT: win rate
  const INT = clamp(scaleRaw(winRate, 10, 90) + bonus);

  // TIM: blend of resign rate AND win rate so low-elo players aren't punished
  // for opponents not resigning. cleanWins alone bottoms out at low elo.
  const cleanWins = wins > 0 ? (resigned / wins) * 100 : 0;
  const timRaw = (cleanWins * 0.5) + (winRate * 0.5);
  const TIM = clamp(scaleRaw(timRaw, 5, 75) + bonus);

  // OVR: weighted blend
  const OVR = clamp(ATK*0.15 + DEF*0.15 + CAL*0.2 + STR*0.15 + INT*0.25 + TIM*0.1);

  console.log("Rating bonus:", bonus, "| avgCap:", avgCap.toFixed(1), "avgChecks:", avgChecks.toFixed(1), "castlePct:", castlePct.toFixed(0)+"%", "avgMoves:", avgMoves.toFixed(1), "openings:", openings.size, "winRate:", winRate.toFixed(0)+"%");

  return { OVR, ATK, DEF, CAL, STR, INT, TIM, wins, losses, draws, total: n };
}


// ── Render card ───────────────────────────────────────────────────────────────

function renderCard(username, avatar, rating, title, stats) {
  document.getElementById("cardUsername").textContent = username.toUpperCase();
  document.getElementById("cardMeta").textContent     = (title ? title + " · " : "") + stats.total + " GAMES";
  document.getElementById("cardOvr").textContent      = stats.OVR;

  document.getElementById("recW").textContent   = stats.wins;
  document.getElementById("recD").textContent   = stats.draws;
  document.getElementById("recL").textContent   = stats.losses;
  document.getElementById("recElo").textContent = rating || "—";

  document.getElementById("cardFooter").textContent = "CHESSCARD · " + stats.total + " GAMES ANALYZED";

  const avatarEl = document.getElementById("avatarEl");
  if (avatar) {
    avatarEl.innerHTML = `<img src="${avatar}" alt="avatar" onerror="this.parentElement.textContent='♟'"/>`;
  } else {
    avatarEl.textContent = "♟";
  }

  const statNames = { ATK: "ATTACK", DEF: "DEFENSE", CAL: "CALCULATION", STR: "STRATEGY", INT: "INTELLIGENCE", TIM: "TIMING" };
  const grid = document.getElementById("statsGrid");
  grid.innerHTML = "";

  for (const [key, label] of Object.entries(statNames)) {
    const val = stats[key];
    grid.innerHTML += `
      <div class="stat-cell">
        <div class="stat-label">${label}</div>
        <div class="stat-row">
          <div class="stat-num">${val}</div>
          <div class="stat-bar-wrap">
            <div class="stat-bar" data-val="${val}"></div>
          </div>
        </div>
      </div>
    `;
  }

  requestAnimationFrame(() => {
    document.querySelectorAll(".stat-bar").forEach(bar => {
      setTimeout(() => { bar.style.width = bar.dataset.val + "%"; }, 100);
    });
  });

  document.getElementById("cardWrap").classList.add("visible");
}


// ── Fetch + generate ──────────────────────────────────────────────────────────

async function generateCard() {
  const username = document.getElementById("usernameInput").value.trim();
  if (!username) return;

  const errorEl = document.getElementById("errorMsg");
  const spinner = document.getElementById("spinner");
  const btn     = document.getElementById("generateBtn");

  errorEl.textContent = "";
  document.getElementById("cardWrap").classList.remove("visible");
  spinner.classList.add("visible");
  btn.disabled = true;

  try {
    // 1. Profile
    const profileRes = await fetch(`https://api.chess.com/pub/player/${username}`);
    if (!profileRes.ok) throw new Error("Player not found on chess.com");
    const profile = await profileRes.json();

    // 2. Ratings — pick most-played format
    const statsRes  = await fetch(`https://api.chess.com/pub/player/${username}/stats`);
    const statsData = await statsRes.json();

    const formats = [
      { name: "blitz",  rating: statsData?.chess_blitz?.last?.rating  || 0, games: (statsData?.chess_blitz?.record?.win  || 0) + (statsData?.chess_blitz?.record?.loss  || 0) + (statsData?.chess_blitz?.record?.draw  || 0) },
      { name: "bullet", rating: statsData?.chess_bullet?.last?.rating || 0, games: (statsData?.chess_bullet?.record?.win || 0) + (statsData?.chess_bullet?.record?.loss || 0) + (statsData?.chess_bullet?.record?.draw || 0) },
      { name: "rapid",  rating: statsData?.chess_rapid?.last?.rating  || 0, games: (statsData?.chess_rapid?.record?.win  || 0) + (statsData?.chess_rapid?.record?.loss  || 0) + (statsData?.chess_rapid?.record?.draw  || 0) },
    ];
    formats.forEach(f => console.log(f.name, f.rating, f.games + " games"));

    const best   = formats.reduce((a, b) => b.games > a.games ? b : a);
    const rating = best.rating || null;
    console.log("Using:", best.name, rating);

    // 3. Last 30 games
    const archRes   = await fetch(`https://api.chess.com/pub/player/${username}/games/archives`);
    const archData  = await archRes.json();
    const archives  = archData.archives || [];
    if (!archives.length) throw new Error("No games found");

    const gamesRes  = await fetch(archives[archives.length - 1]);
    const gamesData = await gamesRes.json();
    const games     = (gamesData.games || []).slice(-30);
    if (!games.length) throw new Error("No recent games found");

    // 4. Compute + render
    const stats = calcStats(games, username, rating);
    renderCard(profile.username, profile.avatar || null, rating, profile.title || null, stats);

  } catch (err) {
    errorEl.textContent = "✕ " + err.message;
  } finally {
    spinner.classList.remove("visible");
    btn.disabled = false;
  }
}

document.getElementById("usernameInput").addEventListener("keydown", e => {
  if (e.key === "Enter") generateCard();
});


// ── Theme switcher ────────────────────────────────────────────────────────────

function setTheme(btn) {
  document.querySelectorAll(".theme-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  document.documentElement.style.setProperty("--accent", btn.dataset.accent);
  document.querySelectorAll(".stat-bar").forEach(b => b.style.background = btn.dataset.accent);
}
