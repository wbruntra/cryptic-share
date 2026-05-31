#!/bin/bash
# Download crossword.db from gaybor_new

REMOTE_PATH="/home/william/cryptic-share/crossword-backend/crossword.db"
LOCAL_PATH="./crossword-backend/crossword.db"

scp gaybor_new:"${REMOTE_PATH}" "${LOCAL_PATH}"
