#!/bin/bash
set -e
echo "==============================================="
echo " Rhinestone Vectorizer - Quick Start"
echo "==============================================="

if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is not installed."
    echo "Please install from: https://nodejs.org"
    exit 1
fi

if [ ! -d "node_modules" ]; then
    echo "Installing dependencies (first time only)..."
    npm install
fi

echo ""
echo "Starting dev server at http://localhost:5173"
echo "Press Ctrl+C to stop."
echo ""
npm run dev
