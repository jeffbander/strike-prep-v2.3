import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { fetchAmionSchedule, type AmionWebConfig, type AmionScrapeResult } from "@/lib/amionWebScraper";

/**
 * Amion Schedule Scraper API
 *
 * POST /api/amion/scrape
 * Body: { siteCode, locationCode, startDate, endDate }
 *
 * Returns scraped schedule data with split shift support
 */
export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const { siteCode, locationCode, startDate, endDate } = body as Partial<AmionWebConfig>;

    // Validate required fields
    if (!siteCode || !locationCode || !startDate || !endDate) {
      return NextResponse.json(
        { error: "Missing required fields: siteCode, locationCode, startDate, endDate" },
        { status: 400 }
      );
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      return NextResponse.json(
        { error: "Invalid date format. Use YYYY-MM-DD" },
        { status: 400 }
      );
    }

    // Validate date range (max 31 days to prevent abuse)
    const start = new Date(startDate);
    const end = new Date(endDate);
    const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDiff < 0) {
      return NextResponse.json(
        { error: "endDate must be after startDate" },
        { status: 400 }
      );
    }
    if (daysDiff > 31) {
      return NextResponse.json(
        { error: "Date range cannot exceed 31 days" },
        { status: 400 }
      );
    }

    // Scrape the schedule
    const config: AmionWebConfig = {
      siteCode,
      locationCode,
      startDate,
      endDate,
    };

    const result: AmionScrapeResult = await fetchAmionSchedule(config);

    // Return results
    return NextResponse.json({
      success: true,
      data: result,
      stats: {
        servicesFound: result.services.length,
        assignmentsFound: result.assignments.length,
        splitShifts: result.assignments.filter(a => a.secondaryProviderName).length,
        errorsCount: result.errors.length,
      },
    });
  } catch (error) {
    console.error("Amion scrape error:", error);
    return NextResponse.json(
      { error: "Failed to scrape Amion schedule", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export const runtime = "nodejs";
// Allow longer timeout for scraping
export const maxDuration = 60;
