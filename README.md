# chess-stat-cards
Turn your Chess.com games into a stat card.

## How to run
Just open `index.html` in your browser. No installs needed.

## Files
- `index.html` — page structure
- `style.css`  — all the styling
- `script.js`  — fetch + stat logic

## How stats work
Uses your last 30 games from Chess.com's public API.

| Stat | What it measures |
|------|-----------------|
| ATK  | Captures + checks per game |
| DEF  | Castling rate + loss avoidance |
| CAL  | Average game length |
| STR  | Opening variety |
| INT  | Win rate |
| TIM  | Endgame promotions |
| OVR  | Weighted blend of all 6 |

## Try these usernames
`hikaru`, `magnuscarlsen`, or your own chess.com username
