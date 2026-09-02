#!/bin/bash
# Convenience script to check common localizations against English base
# Place this script in the same directory as check_localization_completeness.py

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_PATH="$SCRIPT_DIR/check_localization_completeness.py"

# Repository root, derived from this script's location
# (<repo>/mobile/ios/Air/scripts/strings). Set BASE_DIR explicitly if the
# scripts were copied outside the repository.
BASE_DIR="${BASE_DIR:-$(cd "$SCRIPT_DIR/../../../../.." && pwd)}"
MAIN_I18N_DIR="$BASE_DIR/src/i18n"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Set by any check that fails; the script exits non-zero at the end so CI and
# automation can tell a real pass from a run that only printed its banners.
failed=0

# Counts checks that actually ran. Success requires at least one, so no
# combination of missing inputs can produce a green run: a skipped check is a
# check that did not pass.
checks_run=0

echo "🔍 Localization Completeness Checker"
echo "====================================="
echo

check_localization() {
    local base_file="$1"
    local compare_file="$2"
    local description="$3"

    if [ ! -f "$base_file" ]; then
        echo -e "${RED}❌ Base file not found: $base_file${NC}"
        return 1
    fi

    if [ ! -f "$compare_file" ]; then
        echo -e "${RED}❌ Comparison file not found: $compare_file${NC}"
        return 1
    fi

    echo -e "${BLUE}📋 Checking $description${NC}"
    echo -e "${BLUE}   Base: $(basename "$base_file")${NC}"
    echo -e "${BLUE}   Compare: $(basename "$compare_file")${NC}"
    echo

    if python3 "$SCRIPT_PATH" --base "$base_file" --compare "$compare_file"; then
        echo -e "${GREEN}✅ $description check passed${NC}"
        echo
    else
        echo -e "${RED}❌ $description check failed${NC}"
        echo
        return 1
    fi
}

# Check main localizations
if [ -d "$MAIN_I18N_DIR" ]; then
    echo "🌍 Checking main localizations..."
    echo

    locale_checks_run=0
    for compare_file in "$MAIN_I18N_DIR"/*.yaml; do
        if [ "$compare_file" = "$MAIN_I18N_DIR/en.yaml" ]; then
            continue
        fi

        locale_code="$(basename "$compare_file" .yaml)"
        locale_checks_run=$((locale_checks_run + 1))
        checks_run=$((checks_run + 1))
        check_localization "$MAIN_I18N_DIR/en.yaml" "$compare_file" "$locale_code (main)" || failed=1
    done

    if [ "$locale_checks_run" -eq 0 ]; then
        echo -e "${RED}❌ No non-English localizations found in: $MAIN_I18N_DIR${NC}"
        echo
        failed=1
    fi
else
    echo -e "${RED}❌ Localization directory not found: $MAIN_I18N_DIR${NC}"
    echo -e "${RED}   Set BASE_DIR to the repository root and re-run.${NC}"
    exit 1
fi

echo "🎯 Localization checks done."
echo

echo "📱 Checking Swift localization usage..."
echo
checks_run=$((checks_run + 1))
if python3 "$SCRIPT_DIR/find_unused_localization_keys.py" --ios-path "$BASE_DIR"; then
    echo -e "${GREEN}✅ Swift localization check passed${NC}"
else
    echo -e "${RED}❌ Swift localization check failed${NC}"
    failed=1
fi
echo

if [ "$checks_run" -eq 0 ]; then
    echo -e "${RED}❌ No checks ran${NC}"
    exit 1
fi

if [ "$failed" -ne 0 ]; then
    echo -e "${RED}❌ Some checks failed${NC}"
    exit 1
fi

echo "🎯 All checks passed!"
echo
echo "💡 Tips:"
echo "   - Run localization checks with --verbose for detailed statistics"
echo "   - Run Swift key scan with --verbose to see file counts"
echo "   python3 $SCRIPT_PATH --base <base_file> --compare <compare_file> --verbose"
echo "   python3 $SCRIPT_DIR/find_unused_localization_keys.py --ios-path $BASE_DIR --verbose"
