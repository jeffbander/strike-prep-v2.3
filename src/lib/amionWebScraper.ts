/**
 * Amion Web Scraper
 * Scrapes schedule data from amion.com for split shift handling
 */

import { chromium, type Browser, type Page } from "playwright";

export interface AmionWebConfig {
  siteCode: string;        // "mssm"
  locationCode: string;    // "msw20lqu"
  startDate: string;       // "2025-01-15"
  endDate: string;         // "2025-01-20"
}

export interface AmionScrapedAssignment {
  date: string;            // "2025-01-15"
  serviceName: string;     // "MSW EP ATTENDING"

  // Primary provider
  primaryProviderName: string;
  primaryShiftStart?: string;  // "7a"
  primaryShiftEnd?: string;    // "5p"

  // Secondary provider (for split shifts)
  secondaryProviderName?: string;
  secondaryShiftStart?: string;  // "5p"
  secondaryShiftEnd?: string;    // "7a"

  // Raw cell text for debugging
  rawText: string;
}

export interface AmionScrapedService {
  name: string;
  shiftDisplay?: string;  // "7a-5p" or "7a-7a" for 24h
}

export interface AmionScrapeResult {
  department: string;
  services: AmionScrapedService[];
  assignments: AmionScrapedAssignment[];
  startDate: string;
  endDate: string;
  scrapedAt: number;
  errors: string[];
}

/**
 * Parse a cell containing schedule text
 * Handles formats like:
 * - "Shahab" (single provider, full shift)
 * - "Shahab 7a-5p / GOLDFINGER 5p-7a" (split shift)
 * - "Shahab 7a-5p" (single provider with time)
 * - "Shahab/GOLDFINGER" (split without times - assume 12hr each)
 */
export function parseScheduleCell(
  cellText: string,
  serviceName: string,
  date: string
): AmionScrapedAssignment | null {
  const trimmed = cellText.trim();
  if (!trimmed || trimmed === "-" || trimmed === "—") {
    return null;
  }

  // Split shift pattern: "Name1 time1 / Name2 time2" or "Name1/Name2"
  const splitPattern = /^(.+?)\s*\/\s*(.+)$/;
  const splitMatch = trimmed.match(splitPattern);

  if (splitMatch) {
    const part1 = splitMatch[1].trim();
    const part2 = splitMatch[2].trim();

    const parsed1 = parseProviderPart(part1);
    const parsed2 = parseProviderPart(part2);

    return {
      date,
      serviceName,
      primaryProviderName: parsed1.name,
      primaryShiftStart: parsed1.shiftStart,
      primaryShiftEnd: parsed1.shiftEnd,
      secondaryProviderName: parsed2.name,
      secondaryShiftStart: parsed2.shiftStart,
      secondaryShiftEnd: parsed2.shiftEnd,
      rawText: trimmed,
    };
  }

  // Single provider pattern
  const parsed = parseProviderPart(trimmed);
  return {
    date,
    serviceName,
    primaryProviderName: parsed.name,
    primaryShiftStart: parsed.shiftStart,
    primaryShiftEnd: parsed.shiftEnd,
    rawText: trimmed,
  };
}

/**
 * Parse a provider part like "Shahab 7a-5p" or just "Shahab"
 */
function parseProviderPart(text: string): {
  name: string;
  shiftStart?: string;
  shiftEnd?: string;
} {
  // Time range pattern: "Name 7a-5p" or "Name 7:00-17:00"
  const timePattern = /^(.+?)\s+(\d{1,2}:?\d{0,2}[ap]?m?)\s*[-–]\s*(\d{1,2}:?\d{0,2}[ap]?m?)$/i;
  const timeMatch = text.match(timePattern);

  if (timeMatch) {
    return {
      name: timeMatch[1].trim(),
      shiftStart: normalizeTime(timeMatch[2]),
      shiftEnd: normalizeTime(timeMatch[3]),
    };
  }

  // Just a name
  return { name: text.trim() };
}

/**
 * Normalize time format to "7a" style
 */
function normalizeTime(time: string): string {
  const cleaned = time.toLowerCase().replace(/\s/g, "");

  // Already in "7a" format
  if (/^\d{1,2}[ap]$/.test(cleaned)) {
    return cleaned;
  }

  // "7am" or "7pm" format
  if (/^\d{1,2}[ap]m$/.test(cleaned)) {
    return cleaned.replace("m", "");
  }

  // "7:00" or "17:00" format - convert to 12hr
  const colonMatch = cleaned.match(/^(\d{1,2}):(\d{2})$/);
  if (colonMatch) {
    let hour = parseInt(colonMatch[1], 10);
    const suffix = hour >= 12 ? "p" : "a";
    if (hour > 12) hour -= 12;
    if (hour === 0) hour = 12;
    return `${hour}${suffix}`;
  }

  return cleaned;
}

/**
 * Build Amion URL for a specific date
 */
function buildAmionUrl(config: AmionWebConfig, date: string): string {
  const d = new Date(date);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const year = d.getFullYear();

  // Amion URL format: https://amion.com/cgi-bin/ocs?site=mssm&Lo=msw20lqu&Mo=1&Rone=15&Yearone=2025
  return `https://www.amion.com/cgi-bin/ocs?site=${config.siteCode}&Lo=${config.locationCode}&Mo=${month}&Rone=${day}&Yearone=${year}`;
}

/**
 * Scrape Amion schedule for a date range
 * Uses Playwright to navigate and extract schedule data
 */
export async function scrapeAmionSchedule(
  config: AmionWebConfig
): Promise<AmionScrapeResult> {
  const result: AmionScrapeResult = {
    department: "",
    services: [],
    assignments: [],
    startDate: config.startDate,
    endDate: config.endDate,
    scrapedAt: Date.now(),
    errors: [],
  };

  let browser: Browser | null = null;

  try {
    // Launch browser
    browser = await chromium.launch({
      headless: true,
    });

    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });

    const page = await context.newPage();

    // Generate dates in range
    const dates = getDateRange(config.startDate, config.endDate);

    // Scrape first date to get service list
    const firstUrl = buildAmionUrl(config, dates[0]);
    await page.goto(firstUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Extract department name from page title or header
    const pageTitle = await page.title();
    result.department = pageTitle.replace(/Amion:?\s*/i, "").trim() || `${config.siteCode} Schedule`;

    // Extract services from the schedule grid
    const servicesData = await extractServices(page);
    result.services = servicesData;

    // Extract assignments for first date
    const firstDateAssignments = await extractAssignments(page, dates[0]);
    result.assignments.push(...firstDateAssignments);

    // Scrape remaining dates
    for (let i = 1; i < dates.length; i++) {
      const dateUrl = buildAmionUrl(config, dates[i]);

      try {
        await page.goto(dateUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
        const assignments = await extractAssignments(page, dates[i]);
        result.assignments.push(...assignments);
      } catch (err) {
        result.errors.push(`Failed to scrape ${dates[i]}: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }

    await browser.close();
  } catch (err) {
    result.errors.push(`Scraping failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    if (browser) {
      await browser.close();
    }
  }

  return result;
}

/**
 * Extract service names from the schedule page
 */
async function extractServices(page: Page): Promise<AmionScrapedService[]> {
  const services: AmionScrapedService[] = [];

  try {
    // Amion typically has service names in the first column of the schedule table
    // Look for table cells that appear to be row headers
    const serviceElements = await page.$$("table tr td:first-child, table tr th:first-child");

    for (const el of serviceElements) {
      const text = await el.textContent();
      if (text && text.trim().length > 2 && !text.includes("Date") && !text.includes("Time")) {
        const serviceName = text.trim();

        // Check if service already exists
        if (!services.find(s => s.name === serviceName)) {
          services.push({ name: serviceName });
        }
      }
    }
  } catch (err) {
    console.error("Error extracting services:", err);
  }

  return services;
}

/**
 * Extract assignments for a specific date from the page
 */
async function extractAssignments(
  page: Page,
  date: string
): Promise<AmionScrapedAssignment[]> {
  const assignments: AmionScrapedAssignment[] = [];

  try {
    // Get all schedule table rows
    const rows = await page.$$("table tr");

    for (const row of rows) {
      // Get first cell (service name) and remaining cells (assignments)
      const cells = await row.$$("td");
      if (cells.length < 2) continue;

      const serviceName = (await cells[0].textContent())?.trim() || "";
      if (!serviceName || serviceName.length < 2) continue;

      // Get assignment from the appropriate column (usually 2nd cell for current day)
      const assignmentCell = cells.length > 1 ? cells[1] : null;
      if (!assignmentCell) continue;

      const cellText = (await assignmentCell.textContent())?.trim() || "";
      const parsed = parseScheduleCell(cellText, serviceName, date);

      if (parsed) {
        assignments.push(parsed);
      }
    }
  } catch (err) {
    console.error("Error extracting assignments:", err);
  }

  return assignments;
}

/**
 * Generate array of dates between start and end (inclusive)
 */
function getDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  const current = new Date(start);
  while (current <= end) {
    dates.push(current.toISOString().split("T")[0]);
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

/**
 * Alternative: Fetch and parse Amion data without full browser
 * Uses fetch to get the HTML and parses it directly
 * This is faster but may not work for all Amion configurations
 */
export async function fetchAmionSchedule(
  config: AmionWebConfig
): Promise<AmionScrapeResult> {
  const result: AmionScrapeResult = {
    department: "",
    services: [],
    assignments: [],
    startDate: config.startDate,
    endDate: config.endDate,
    scrapedAt: Date.now(),
    errors: [],
  };

  const dates = getDateRange(config.startDate, config.endDate);

  for (const date of dates) {
    const url = buildAmionUrl(config, date);

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "text/html,application/xhtml+xml",
        },
      });

      if (!response.ok) {
        result.errors.push(`HTTP ${response.status} for ${date}`);
        continue;
      }

      const html = await response.text();
      const parsed = parseAmionHtml(html, date);

      if (parsed.department && !result.department) {
        result.department = parsed.department;
      }

      // Merge services
      for (const service of parsed.services) {
        if (!result.services.find(s => s.name === service.name)) {
          result.services.push(service);
        }
      }

      result.assignments.push(...parsed.assignments);
    } catch (err) {
      result.errors.push(`Failed to fetch ${date}: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  return result;
}

/**
 * Parse Amion HTML to extract schedule data
 * This is a lightweight alternative to Playwright
 */
function parseAmionHtml(
  html: string,
  date: string
): { department: string; services: AmionScrapedService[]; assignments: AmionScrapedAssignment[] } {
  const department = "";
  const services: AmionScrapedService[] = [];
  const assignments: AmionScrapedAssignment[] = [];

  // Simple HTML parsing using regex (for basic extraction)
  // For production, consider using a proper HTML parser like cheerio

  // Extract title for department name
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const dept = titleMatch ? titleMatch[1].replace(/Amion:?\s*/i, "").trim() : "";

  // Find table rows and parse
  // This is a simplified parser - full implementation would use cheerio or similar
  const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;

  let rowMatch;
  while ((rowMatch = rowPattern.exec(html)) !== null) {
    const rowContent = rowMatch[1];
    const cells: string[] = [];

    let cellMatch;
    const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    while ((cellMatch = cellRe.exec(rowContent)) !== null) {
      // Strip HTML tags from cell content
      const cellText = cellMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      cells.push(cellText);
    }

    if (cells.length >= 2) {
      const serviceName = cells[0];
      const cellText = cells[1];

      if (serviceName && serviceName.length > 2) {
        // Add service if new
        if (!services.find(s => s.name === serviceName)) {
          services.push({ name: serviceName });
        }

        // Parse assignment
        const parsed = parseScheduleCell(cellText, serviceName, date);
        if (parsed) {
          assignments.push(parsed);
        }
      }
    }
  }

  return { department: dept, services, assignments };
}
