# Kingdom Wars - Game Tester

A local game server that simulates Kingdom Wars matches between bots.

## Usage

```bash
./game.sh <bot1_url> <bot2_url> [bot3_url] [bot4_url]
```

### Examples

**2 bots (duplicated to fill 4 slots):**
```bash
./game.sh http://localhost:8000 http://localhost:8001
```

**4 bots:**
```bash
./game.sh http://localhost:8000 http://localhost:8001 http://localhost:8002 http://localhost:8003
```

**Same bot against itself (useful for testing):**
```bash
./game.sh http://localhost:8000 http://localhost:8000 http://localhost:8000 http://localhost:8000
```

## Output

The tester displays:
- Turn-by-turn game state
- Diplomacy messages between bots
- Combat actions (attacks, armor, upgrades)
- Tower status (HP, Armor, Resources, Level)
- Final winner with their URL

At the end, it outputs `WINNER_URL=<url>` for easy scripting.

## Game Rules Implemented

- **Starting Stats**: 100 HP, 0 armor, 0 resources, Level 1
- **Resource Generation**: `20 × (1.5 ^ (level - 1))` per turn
- **Upgrade Costs**: `50 × (1.75 ^ (level - 1))`
- **Fatigue**: After turn 25, all towers take escalating damage (5, 10, 15... per turn)
- **Win Condition**: Last tower standing

## Requirements

- Node.js (no additional dependencies required)
- Bots must respond within 1 second

## Quick Test

Start your bot in one terminal:
```bash
cd .. && npm run dev
```

Run the tester in another terminal:
```bash
./game.sh http://localhost:8000 http://localhost:8000 http://localhost:8000 http://localhost:8000
```
