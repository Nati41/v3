#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# Deploy Script for tofespdf.co.il
# ═══════════════════════════════════════════════════════════════════════════

FTP_HOST="ftp.tofespdf.co.il"
FTP_USER="nati058790@tofespdf.co.il"
LOCAL_PATH="/Users/haimdayan/Desktop/v3-main"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}   Deploy to tofespdf.co.il${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"

echo -n "Enter FTP password: "
read -s FTP_PASS
echo ""

upload_file() {
    local local_file="$1"
    local remote_path="$2"
    echo -e "${GREEN}>> Uploading $remote_path${NC}"
    curl -s --ftp-pasv --ftp-create-dirs \
        -T "$local_file" \
        --user "$FTP_USER:$FTP_PASS" \
        "ftp://$FTP_HOST/$remote_path"
    if [ $? -eq 0 ]; then
        echo "   ✓ Done"
    else
        echo -e "${RED}   ✗ Failed${NC}"
        return 1
    fi
}

upload_file "$LOCAL_PATH/src/mapper-v3/ui/QuickFillOverlay.js" "src/mapper-v3/ui/QuickFillOverlay.js"
upload_file "$LOCAL_PATH/src/mapper-v3/styles/mapper-v3.css" "src/mapper-v3/styles/mapper-v3.css"
upload_file "$LOCAL_PATH/src/livefill/js/preview-text-renderer.js" "src/livefill/js/preview-text-renderer.js"
upload_file "$LOCAL_PATH/src/livefill/js/export-engine.js" "src/livefill/js/export-engine.js"

echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}   Deploy completed!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
