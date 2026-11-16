import gzip
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CSS_PATH = ROOT.parent / "src" / "web" / "viewer" / "viewerChrome.css"
ADAPTER_PATH = ROOT.parent / "src" / "web" / "viewer" / "RealViewerAdapter.ts"
SCOPE = "html .bsh-viewer-surface .adsk-viewing-viewer"

UPSTREAM_SELECTORS = [
    ".adsk-toolbar",
    ".adsk-control-group",
    ".adsk-button",
    ".adsk-button:focus",
    ".adsk-button:hover",
    ".adsk-button.active",
    ".adsk-button.disabled",
    ".adsk-label-button label",
    ".adsk-label-button:hover label",
    ".adsk-label-button:focus label",
    ".adsk-label-button.active label",
    ".adsk-control-tooltip",
    ".toolbar-settings-sub-menu",
    ".toolbar-submenu .toolbar-submenu-listitem:hover",
    ".toolbar-submenu .toolbar-submenu-horizontal-divider",
    ".toolbar-submenu .toolbar-submenu-checkbox",
    ".docking-panel",
    ".docking-panel-delimiter-shadow",
    ".docking-panel-title",
    ".viewer-settings-panel .docking-panel-title",
    ".docking-panel-close",
    ".docking-panel-close:hover",
    ".docking-panel-footer",
    ".docking-panel-footer-resizer",
    ".docking-panel-footer-resizer:hover",
    ".docking-panel-primary-button",
    ".docking-panel-primary-button:hover",
    ".docking-panel-primary-button:focus",
    ".docking-panel-primary-button.active",
    ".docking-panel-secondary-button",
    ".docking-panel-secondary-button:hover",
    ".docking-panel-secondary-button:focus",
    ".docking-panel-secondary-button.active",
    ".docking-panel-tertiary-button",
    ".docking-panel-tertiary-button:hover",
    ".docking-panel-tertiary-button:focus",
    ".docking-panel-tertiary-button.active",
    ".viewer-settings-panel .docking-panel-tertiary-button:active",
    ".docking-panel-container-solid-color-a",
    ".docking-panel-container-solid-color-b",
    ".docking-panel-container-solid-color-c",
    ".docking-panel-container-gradient",
    ".docking-panel-textbox",
    ".docking-panel-scroll",
    ".docking-panel-scroll::-webkit-scrollbar-track",
    ".docking-panel-scroll::-webkit-scrollbar-thumb",
    ".docking-panel-scroll::-webkit-scrollbar-thumb:hover",
    ".docking-panel-scroll::-webkit-resizer",
    ".docking-pane-scroll::-webkit-scrollbar-corner",
    ".treeview group",
    ".treeview .group",
    ".treeview leaf",
    ".treeview .leaf",
    ".treeview leaf.selected-ex > lmvheader > label",
    ".treeview group.selected-ex > lmvheader > label",
    ".treeview group.selected label",
    ".treeview .group.selected label",
    ".treeview leaf.selected label",
    ".treeview .leaf.selected label",
    ".treeview group.selected > lmvheader",
    ".treeview .group.selected > lmvheader",
    "leaf.selected > lmvheader",
    ".leaf.selected > lmvheader",
    ".treeview group.selected > leaf",
    ".treeview .group.selected .leaf",
    ".treeview group.category > lmvheader",
    ".treeview .group.category > lmvheader",
    ".treeview leaf > lmvheader > label",
    ".treeview group > lmvheader > label",
    ".treeview .leaf > lmvheader > label",
    ".treeview .group > lmvheader > label",
    ".treeview leaf > lmvheader:hover",
    ".treeview group > lmvheader:hover",
    ".treeview .leaf > lmvheader:hover",
    ".treeview .group > lmvheader:hover",
    ".treeview leaf.dim > lmvheader > label",
    ".treeview group.dim > lmvheader > label",
    ".treeview .leaf.dim > lmvheader > label",
    ".treeview .group.dim > lmvheader > label",
    ".treeview div.visibility",
    ".treeview div.visibility:hover",
    ".treeview .dim div.visibility",
    ".treeview .collapsed > lmvheader > icon",
    ".treeview .collapsed.selected > lmvheader > icon",
    ".treeview .expanded > lmvheader > icon",
    ".treeview .expanded.selected > lmvheader > icon",
    ".property-panel .no-properties",
    ".model-structure-panel .lmv-no-properties",
    ".property-panel .property-name",
    ".property-panel .property-value",
    ".option-drop-down",
    ".property-drop-down",
    ".adsk-lmv-tftable input",
    ".property-panel .property-drop-down",
    ".property-panel .property-drop-down > option",
    ".adsk-lmv-tftable input:disabled",
    ".adsk-lmv-tftable input[type=range]:disabled",
    ".adsk-lmv-tftable tr td div",
    ".viewer-settings-panel .adsk-lmv-tftable tr td:first-child div",
    ".viewer-settings-panel .adsk-lmv-tftable tr td:first-child .switch-slider-row-beta-label",
    ".switch-slider-row-beta-label",
    ".adsk-lmv-tftable tr.logical-group",
    ".adsk-lmv-tftable tr.logical-group td div",
    ".viewer-settings-panel.docking-panel .settings-tabs span",
    ".viewer-settings-panel.docking-panel .settings-tabs span:hover",
    ".viewer-settings-panel.docking-panel .settings-tabs .tabselected span",
    ".settings-tabs ul",
    ".viewer-settings-panel .settings-environment-cell",
    ".viewer-settings-panel .settings-cell",
    ".viewer-settings-panel .settings-environment-cell:hover",
    ".viewer-settings-panel .settings-cell:hover",
    ".viewer-settings-panel .settings-environment-cell.border-select",
    ".viewer-settings-panel .settings-cell.border-select",
    ".viewer-settings-panel .settings-environment-name",
    ".viewer-settings-panel .settings-name",
    ".viewer-settings-panel .settings-description",
    ".viewer-settings-panel .settings-environment-image",
    ".switch .slider",
    ".switch .slider:before",
    ".switch input:checked + .slider:before",
    ".viewer-settings-panel .option-drop-down",
    ".viewer-settings-panel .env-select-trigger",
    ".viewer-settings-panel .env-select-list",
    ".viewer-settings-panel .env-select-option:hover",
    ".viewer-settings-panel .env-select-option.focused",
    ".viewer-settings-panel .env-select-option.selected",
    ".viewer-settings-panel .experimental-overflow-menu",
    ".viewer-settings-panel .experimental-overflow-item:hover",
    ".adsk-filterbox input.filter-box",
    ".adsk-searchbox input.search-box",
    ".adsk-filterbox input.filter-box:focus",
    ".adsk-searchbox input.search-box:focus",
    ".adsk-searchbox .search-box-icon",
    ".adsk-searchbox .search-box-icon.focused",
    ".adsk-filterbox .filter-box-icon",
    ".adsk-filterbox .filter-box-icon.focused",
    ".adsk-filterbox .filter-box-close",
    ".adsk-searchbox .search-box-close",
    ".adsk-filterbox .filter-box-close:hover",
    ".adsk-searchbox .search-box-close:hover",
    ".propertysearch-icon",
    ".adsk-search-results-scrolling-panel .selected",
    ".adsk-search-results-scrolling-panel > div[lmv-nodeid]:hover",
    ".adsk-search-results-scrolling-panel .search-match",
    ".adsk-search-results-scrolling-panel .search-path",
    ".adsk-search-results-scrolling-panel .no-results-description",
    ".adsk-search-results-scrolling-panel .no-results-title",
    ".docking-panel.menu .menu-item:hover",
    ".docking-panel.menu .menu-divider",
    ".docking-panel.menu .menu-item-expand",
    ".hud-message",
    ".loading-spinner path",
    ".loading-spinner path:first-child",
    ".loading-spinner .message",
    ".progressbg",
    ".progressfg",
    ".progresslb",
    ".alert-box",
    ".alert-box-msg",
    ".alert-box-ok",
    ".alert-box-ok:hover",
    ".hyperlink-container",
    ".hyperlink-container-triangle",
]

OWN_SELECTORS = [
    "*",
    ".adsk-toolbar *",
    ".adsk-button.active:hover",
    ".adsk-button:focus-visible",
    ".adsk-button.disabled:hover",
    ".adsk-button.disabled:focus",
    ".option-drop-down:focus-visible",
    ".property-drop-down:focus-visible",
    ".adsk-lmv-tftable input:focus-visible",
    ".adsk-filterbox input.filter-box::placeholder",
    ".adsk-searchbox input.search-box::placeholder",
]


def normalize(text):
    return re.sub(r"\s*([>,+])\s*", r"\1", re.sub(r"\s+", " ", text.replace(chr(34), ""))).strip()


def stylesheet_url():
    source = ADAPTER_PATH.read_text()
    version = re.search(r"VIEWER_VERSION = '([^']+)'", source).group(1)
    base = re.search(r"VIEWER_BASE = `([^`]+)`", source).group(1)
    return base.replace("${VIEWER_VERSION}", version) + "/style.min.css"


def fetch_stylesheet(url):
    with urllib.request.urlopen(url, timeout=30) as response:
        body = response.read()
    if body[:2] == b"\x1f\x8b":
        body = gzip.decompress(body)
    return body.decode("utf-8", "replace")


def chrome_tails(css_text):
    css_text = re.sub(r"/\*.*?\*/", "", css_text, flags=re.S)
    tails = set()
    for group in re.findall(r"([^{}]+)\{[^{}]*\}", css_text):
        for selector in group.split(","):
            selector = normalize(selector)
            if selector == SCOPE:
                continue
            if not selector.startswith(SCOPE + " "):
                return None, selector
            tails.add(selector[len(SCOPE) + 1 :])
    return tails, None


def check(stylesheet_text):
    tails, bad = chrome_tails(CSS_PATH.read_text())
    if tails is None:
        return [f"viewerChrome.css selector outside the scope prefix: {bad}"]
    declared = {normalize(t) for t in UPSTREAM_SELECTORS + OWN_SELECTORS}
    problems = [f"in viewerChrome.css but not in the list: {t}" for t in sorted(tails - declared)]
    problems += [f"in the list but not in viewerChrome.css: {t}" for t in sorted(declared - tails)]
    haystack = normalize(stylesheet_text)
    problems += [
        f"missing from the Autodesk stylesheet: {t}"
        for t in UPSTREAM_SELECTORS
        if normalize(t) not in haystack
    ]
    return problems


def main():
    source = sys.argv[1] if len(sys.argv) > 1 else stylesheet_url()
    text = Path(source).read_text() if Path(source).exists() else fetch_stylesheet(source)
    problems = check(text)
    for problem in problems:
        print(f"FAIL {problem}")
    if not problems:
        print(f"PASS {len(UPSTREAM_SELECTORS)} upstream selectors found in {source}")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
