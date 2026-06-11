#!/usr/bin/env bash
# run.sh — Start the VisionVault AI service
# Requires: Python 3.11 venv at ./venv (run `python3.11 -m venv venv` then pip install -r requirements.txt)
# Fix: Homebrew Python 3.11's pyexpat.so links against /usr/lib/libexpat but needs Homebrew's newer version.

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

export DYLD_LIBRARY_PATH="/opt/homebrew/opt/expat/lib:${DYLD_LIBRARY_PATH}"
source "$SCRIPT_DIR/venv/bin/activate"

echo "Starting VisionVault AI Service (Python $(python --version))..."
python app.py
