#!/bin/bash
# Run this script to push to GitHub
# Usage: ./PUSH_TO_GITHUB.sh

git remote add origin https://github.com/wjbeckett/aviant.git 2>/dev/null || echo "Remote already exists"
git branch -M main
git push -u origin main
