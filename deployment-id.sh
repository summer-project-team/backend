#!/bin/bash

# Generate deployment ID with format: DEPLOY-[DATE:TIME]-ID-NUMBER
# DATE format: YYYYMMDD
# TIME format: HHMMSS
# NUMBER: Random 6-digit number

# Get current date and time
DATE=$(date +%Y%m%d)
TIME=$(date +%H%M%S)

# Generate random 6-digit number
ID_NUMBER=$(shuf -i 100000-999999 -n 1)

# Output the deployment ID
echo "DEPLOY-${DATE}:${TIME}-ID-${ID_NUMBER}"
