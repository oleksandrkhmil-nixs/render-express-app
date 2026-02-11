#!/bin/bash

# Kingdom Wars - Game Tester
# Usage: ./game.sh <bot1_url> <bot2_url> <bot3_url> <bot4_url>
# Example: ./game.sh http://localhost:8000 http://localhost:8001 http://localhost:8002 http://localhost:8003

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Check arguments
if [ "$#" -lt 2 ]; then
    echo -e "${RED}Error: At least 2 bot URLs required${NC}"
    echo "Usage: $0 <bot1_url> <bot2_url> [bot3_url] [bot4_url]"
    echo "Example: $0 http://localhost:8000 http://localhost:8001 http://localhost:8002 http://localhost:8003"
    exit 1
fi

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check if node is available
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is required but not installed${NC}"
    exit 1
fi

# Run the game engine
node "$SCRIPT_DIR/engine.js" "$@"
