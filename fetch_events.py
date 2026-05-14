"""
fetch_events.py
===============
Replaces Stevesie. Scrapes Facebook events using a real browser session.

First-time setup (run once in your terminal):
  pip install playwright
  python -m playwright install chromium

Credentials — create a file called .env next to this script:
  FB_EMAIL=your@email.com
  FB_PASSWORD=yourpassword

Run this BEFORE main.py:
  python fetch_events.py

If Facebook shows a captcha or verification:
  Set HEADLESS = False, run again, complete it in the browser window,
  then set HEADLESS back to True.
"""

import asyncio
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# ── Config ────────────────────────────────────────────────────────────────────

INPUT_FOLDER = "input"
SESSION_FILE = "fb_session.json"
HEADLESS     = False   # keep False until login is working reliably, then switch to True
TIMEOUT      = 30000   # ms
MAX_SCROLL   = 5

# Current working Facebook events URLs
GHENT_EVENT_URLS = [
    "https://www.facebook.com/events/explore/gent/102155463159279",
]

# ── Credentials ───────────────────────────────────────────────────────────────

def load_credentials():
    env_path = Path(__file__).parent / ".env"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                key, _, val = line.partition("=")
                os.environ.setdefault(key.strip(), val.strip())

    email    = os.environ.get("FB_EMAIL", "").strip()
    password = os.environ.get("FB_PASSWORD", "").strip()

    if not email or not password:
        print("\n  !! No Facebook credentials found.")
        print("     Create a .env file with:")
        print("       FB_EMAIL=your@email.com")
        print("       FB_PASSWORD=yourpassword")
        sys.exit(1)

    return email, password


# ── Page sources ──────────────────────────────────────────────────────────────

def load_page_sources():
    """Read facebook_page_id values from venues.json and collectives.json."""
    pages = []
    here       = Path(__file__).parent
    config_dir = here / "config" if (here / "config").exists() else here

    for fname in ["venues.json", "collectives.json"]:
        fpath = config_dir / fname
        if not fpath.exists():
            continue
        data  = json.loads(fpath.read_text(encoding="utf-8"))
        items = data.get("venues", data.get("collectives", []))
        for item in items:
            if "_comment" in item or str(item.get("id", "")).startswith("_"):
                continue
            pid  = item.get("facebook_page_id")
            name = item.get("name", item.get("id", "?"))
            if pid:
                pages.append((name, pid))

    return pages


# ── Session ───────────────────────────────────────────────────────────────────

async def save_session(context):
    cookies = await context.cookies()
    # Only save if we have actual facebook cookies
    fb_cookies = [c for c in cookies if "facebook.com" in c.get("domain", "")]
    if len(fb_cookies) < 3:
        print("  !! Not enough Facebook cookies — session not saved (login may have failed)")
        return False
    Path(SESSION_FILE).write_text(json.dumps(cookies, indent=2), encoding="utf-8")
    print(f"  Session saved ({len(fb_cookies)} FB cookies)")
    return True


async def load_session(context):
    if not Path(SESSION_FILE).exists():
        return False
    cookies = json.loads(Path(SESSION_FILE).read_text(encoding="utf-8"))
    # Fix sameSite values — Cookie-Editor uses different format than Playwright
    for c in cookies:
        ss = c.get("sameSite", "")
        if ss.lower() == "no_restriction": c["sameSite"] = "None"
        elif ss.lower() == "lax":          c["sameSite"] = "Lax"
        elif ss.lower() == "strict":       c["sameSite"] = "Strict"
        elif ss.lower() == "unspecified":  c["sameSite"] = "None"
        else:                              c["sameSite"] = "None"
    fb_cookies = [c for c in cookies if "facebook.com" in c.get("domain", "")]
    if len(fb_cookies) < 3:
        print("  Saved session looks empty — will log in fresh")
        Path(SESSION_FILE).unlink()
        return False
    await context.add_cookies(cookies)
    print(f"  Loaded saved session ({len(fb_cookies)} FB cookies)")
    return True


async def check_logged_in(page) -> bool:
    """Check if the saved session is still valid — just look at the URL, no feed check."""
    try:
        await page.goto("https://www.facebook.com/", timeout=TIMEOUT)
        await page.wait_for_timeout(4000)
        url = page.url
        # Logged in = stays on facebook.com, not redirected to login
        if "login" in url or "register" in url or "checkpoint" in url:
            return False
        # Also check we're not on an error page
        title = await page.title()
        if "log" in title.lower() and "in" in title.lower():
            return False
        print(f"  Session valid (landed on: {url[:60]})")
        return True
    except:
        return False


# ── Login ─────────────────────────────────────────────────────────────────────

async def dismiss_cookies(page):
    """Wait for and click the cookie consent button."""
    selectors = [
        '[data-cookiebanner="accept_button"]',
        'button:has-text("Alles accepteren")',
        'button:has-text("Accept all")',
        'button:has-text("Allow all cookies")',
        'button:has-text("Alle cookies toestaan")',
        '[aria-label="Alle cookies toestaan"]',
        '[aria-label="Accept all"]',
    ]
    for _ in range(16):  # try for up to 8 seconds
        for sel in selectors:
            try:
                btn = await page.query_selector(sel)
                if btn and await btn.is_visible():
                    await btn.click()
                    print("  Cookie banner dismissed")
                    await page.wait_for_timeout(1500)
                    return True
            except:
                pass
        await page.wait_for_timeout(500)
    return False


async def do_login(page, email, password):
    print("  Navigating to Facebook login...")
    await page.goto("https://www.facebook.com/login", timeout=TIMEOUT)
    await page.wait_for_timeout(3000)

    await dismiss_cookies(page)

    # Wait for email field
    try:
        await page.wait_for_selector('#email', state='visible', timeout=15000)
    except:
        if not HEADLESS:
            print("\n  Could not find the login form automatically.")
            print("  Please log in manually in the browser window.")
            print("  Once you see the Facebook home feed, press Enter here...")
            input()
            return
        else:
            print("  !! Login form not found. Set HEADLESS = False and try again.")
            sys.exit(1)

    print("  Filling in credentials...")
    await page.fill('#email', email)
    await page.wait_for_timeout(500)
    await page.fill('#pass', password)
    await page.wait_for_timeout(500)
    await page.click('[name="login"]')
    await page.wait_for_timeout(6000)

    if "login" in page.url or "checkpoint" in page.url:
        if not HEADLESS:
            print("\n  Facebook is asking for additional verification.")
            print("  Complete it in the browser window, then press Enter here...")
            input()
            await page.wait_for_timeout(3000)
        else:
            print("  !! Verification required. Set HEADLESS = False and try again.")
            sys.exit(1)

    print("  Login complete")


# ── Event extraction ──────────────────────────────────────────────────────────

def extract_events(data) -> list:
    """Recursively find all Event nodes in a GraphQL response."""
    results = []

    def walk(obj):
        if isinstance(obj, dict):
            if obj.get("__typename") == "Event" and "id" in obj and "name" in obj:
                results.append(obj)
                return
            if "edges" in obj and isinstance(obj["edges"], list):
                for edge in obj["edges"]:
                    if isinstance(edge, dict) and "node" in edge:
                        walk(edge["node"])
                return
            for v in obj.values():
                walk(v)
        elif isinstance(obj, list):
            for item in obj:
                walk(item)

    walk(data)
    return results


# ── Scraping ──────────────────────────────────────────────────────────────────

async def scrape_url(page, url: str, label: str, seen_ids: set, all_events: list):
    intercepted = []

    async def on_response(response):
        if "graphql" in response.url and response.status == 200:
            try:
                body = await response.json()
                events = extract_events(body)
                intercepted.extend(events)
            except:
                pass

    page.on("response", on_response)

    try:
        await page.goto(url, timeout=TIMEOUT, wait_until="domcontentloaded")
        await page.wait_for_timeout(4000)

        for _ in range(MAX_SCROLL):
            await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            await page.wait_for_timeout(2500)

    except Exception as e:
        print(f"    !! Error on {label}: {e}")

    page.remove_listener("response", on_response)

    added = 0
    for ev in intercepted:
        eid = ev.get("id")
        if eid and eid not in seen_ids:
            seen_ids.add(eid)
            all_events.append(ev)
            added += 1

    print(f"    {label}: {added} new events (intercepted {len(intercepted)} total)")


# ── Output ────────────────────────────────────────────────────────────────────

def save_results(events: list):
    if not events:
        print("  Nothing to save.")
        return

    os.makedirs(INPUT_FOLDER, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filepath  = os.path.join(INPUT_FOLDER, f"{timestamp}_playwright_scrape.json")

    # Wrap in the GraphQL shape facebook_ingest.py already reads
    payload = {
        "data": {
            "node": {
                "__typename": "User",
                "content_tab": {
                    "requested_tab": {
                        "events": {
                            "edges": [
                                {
                                    "node": ev,
                                    "cursor": str(i),
                                    "backend_request_id": "0",
                                    "www_request_id": "0",
                                    "candidate_sources": [],
                                    "score": 0,
                                }
                                for i, ev in enumerate(events)
                            ],
                            "page_info": {"has_next_page": False, "end_cursor": ""},
                        }
                    }
                },
                "id": "playwright_scraper",
            }
        },
        "_meta": {
            "source":     "playwright",
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "count":      len(events),
        },
    }

    Path(filepath).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  Saved {len(events)} events → {filepath}")


# ── Main ──────────────────────────────────────────────────────────────────────

async def main():
    print("\n" + "=" * 60)
    print("  FETCH EVENTS — Playwright scraper")
    print("=" * 60)

    try:
        from playwright.async_api import async_playwright
    except ImportError:
        print("\n  !! Playwright not installed. Run:")
        print("       pip install playwright")
        print("       python -m playwright install chromium")
        sys.exit(1)

    email, password = load_credentials()
    page_sources    = load_page_sources()
    print(f"  Page sources: {len(page_sources)}")

    all_events = []
    seen_ids   = set()

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=HEADLESS,
            args=["--lang=nl-BE"],
        )
        context = await browser.new_context(
            viewport={"width": 1280, "height": 900},
            locale="nl-BE",
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
        )
        page = await context.new_page()

        # ── Login ──────────────────────────────────────────────
        session_ok = await load_session(context)
        if session_ok:
            logged_in = await check_logged_in(page)
            if not logged_in:
                print("  Session expired — logging in fresh...")
                await do_login(page, email, password)
                await save_session(context)
        else:
            await do_login(page, email, password)
            await save_session(context)

        # ── 1. Ghent events feed ───────────────────────────────
        print(f"\n  [1/2] Facebook events feed...")
        for url in GHENT_EVENT_URLS:
            label = "events-feed"
            await scrape_url(page, url, label, seen_ids, all_events)
            await asyncio.sleep(2)

        # ── 2. Configured pages ────────────────────────────────
        if page_sources:
            print(f"\n  [2/2] Scraping {len(page_sources)} configured pages...")
            for name, pid in page_sources:
                print(f"  → {name}")
                url = f"https://www.facebook.com/{pid}/events"
                await scrape_url(page, url, name, seen_ids, all_events)
                await asyncio.sleep(2)
        else:
            print("\n  [2/2] No page sources configured")

        await browser.close()

    # ── Save ───────────────────────────────────────────────────
    print(f"\n  Total: {len(all_events)} unique events collected")
    save_results(all_events)

    print("\n" + "=" * 60)
    print("  Done. Next step: python main.py")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
