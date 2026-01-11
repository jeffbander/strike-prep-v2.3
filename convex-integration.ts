/**
 * Convex Schema Additions for Amion Integration
 * Add these to your existing convex/schema.ts
 */

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Add these tables to your existing schema
export const amionTables = {
  // Uploaded Amion files
  amionFiles: defineTable({
    filename: v.string(),
    storageId: v.id("_storage"),
    uploadedAt: v.number(),
    uploadedBy: v.optional(v.string()),
    
    // Parsed metadata
    siteId: v.string(),
    department: v.string(),
    lastModified: v.number(),
    contact: v.optional(v.string()),
    yearRange: v.optional(v.string()),
    
    // Status
    parsed: v.boolean(),
    parseError: v.optional(v.string()),
    staffCount: v.optional(v.number()),
    serviceCount: v.optional(v.number()),
    scheduleCount: v.optional(v.number()),
  })
    .index("by_site", ["siteId"])
    .index("by_department", ["department"])
    .index("by_uploaded", ["uploadedAt"]),

  // Extracted staff members
  amionStaff: defineTable({
    fileId: v.id("amionFiles"),
    
    // Amion identifiers
    staffId: v.number(),          // Internal ID (used in ROW binary)
    unid: v.number(),             // External unique ID
    
    // Info
    name: v.string(),
    abbreviation: v.string(),
    staffType: v.number(),
    
    // Contact
    pager: v.optional(v.string()),
    pagerNormalized: v.optional(v.string()), // For matching
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    
    // Matching to app providers
    matchedProviderId: v.optional(v.id("providers")),
    matchConfidence: v.optional(v.string()), // "pager", "name", "manual"
  })
    .index("by_file", ["fileId"])
    .index("by_pager", ["pagerNormalized"])
    .index("by_name", ["name"])
    .index("by_matched", ["matchedProviderId"]),

  // Extracted services/roles
  amionServices: defineTable({
    fileId: v.id("amionFiles"),
    
    serviceId: v.number(),
    unid: v.number(),
    name: v.string(),
    serviceType: v.number(),
    parentId: v.optional(v.number()),
    
    // Shift info
    shiftStartQuarterHour: v.optional(v.number()),
    shiftEndQuarterHour: v.optional(v.number()),
    shiftDurationQuarterHour: v.optional(v.number()),
    shiftStartTime: v.optional(v.string()),  // Human readable
    shiftEndTime: v.optional(v.string()),
    
    description: v.optional(v.string()),
  })
    .index("by_file", ["fileId"])
    .index("by_name", ["name"]),

  // Extracted schedule assignments
  amionSchedule: defineTable({
    fileId: v.id("amionFiles"),
    
    // Date (stored as both for flexibility)
    date: v.string(),             // YYYY-MM-DD
    dateTimestamp: v.number(),    // Unix timestamp
    
    // Service
    serviceId: v.number(),
    serviceName: v.string(),
    
    // Primary assignment
    primaryStaffId: v.optional(v.number()),
    primaryStaffName: v.optional(v.string()),
    primaryProviderId: v.optional(v.id("providers")), // Matched app provider
    
    // Secondary assignment (split shifts)
    secondaryStaffId: v.optional(v.number()),
    secondaryStaffName: v.optional(v.string()),
    secondaryProviderId: v.optional(v.id("providers")),
    
    isEmpty: v.boolean(),
  })
    .index("by_file", ["fileId"])
    .index("by_date", ["date"])
    .index("by_file_date", ["fileId", "date"])
    .index("by_service_date", ["serviceName", "date"])
    .index("by_primary_staff", ["primaryStaffId", "date"])
    .index("by_primary_provider", ["primaryProviderId", "date"]),

  // Holidays from Amion
  amionHolidays: defineTable({
    fileId: v.id("amionFiles"),
    date: v.string(),
    dateTimestamp: v.number(),
    jdn: v.number(),
    holidayType: v.number(),
    name: v.string(),
  })
    .index("by_file", ["fileId"])
    .index("by_date", ["date"]),
};

// ============================================================================
// CONVEX FUNCTIONS (convex/amion.ts)
// ============================================================================

/*
 * Create a new file: convex/amion.ts with these functions
 */

import { v } from "convex/values";
import { mutation, query, action } from "./_generated/server";
import { api } from "./_generated/api";

// --------------------------------------------------------------------------
// FILE UPLOAD
// --------------------------------------------------------------------------

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const createAmionFile = mutation({
  args: {
    filename: v.string(),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const fileId = await ctx.db.insert("amionFiles", {
      filename: args.filename,
      storageId: args.storageId,
      uploadedAt: Date.now(),
      siteId: "",
      department: "",
      lastModified: Date.now(),
      parsed: false,
    });
    
    // Trigger parsing action
    await ctx.scheduler.runAfter(0, api.amion.parseAmionFile, { fileId });
    
    return fileId;
  },
});

// --------------------------------------------------------------------------
// FILE PARSING (Action for CPU-intensive work)
// --------------------------------------------------------------------------

export const parseAmionFile = action({
  args: {
    fileId: v.id("amionFiles"),
  },
  handler: async (ctx, args) => {
    // Get file info
    const file = await ctx.runQuery(api.amion.getFileById, { fileId: args.fileId });
    if (!file) throw new Error("File not found");
    
    // Get file content from storage
    const url = await ctx.storage.getUrl(file.storageId);
    if (!url) throw new Error("File URL not found");
    
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    
    // Parse with Latin-1 encoding
    const decoder = new TextDecoder('iso-8859-1');
    const content = decoder.decode(buffer);
    
    // Import parser dynamically (or inline the parsing logic)
    const { AmionParser } = await import("../lib/amion-parser");
    const parser = new AmionParser(content);
    const result = parser.parse();
    
    // Store results
    await ctx.runMutation(api.amion.storeParseResults, {
      fileId: args.fileId,
      siteId: result.siteId,
      department: result.department,
      lastModified: result.lastModified.getTime(),
      contact: result.contact,
      yearRange: result.yearRange,
      staff: result.staff.map(s => ({
        staffId: s.id,
        unid: s.unid,
        name: s.name,
        abbreviation: s.abbreviation,
        staffType: s.type,
        pager: s.pager,
        phone: s.phone,
      })),
      services: result.services.map(s => ({
        serviceId: s.id,
        unid: s.unid,
        name: s.name,
        serviceType: s.type,
        parentId: s.parentId,
        shiftStart: s.shiftStart,
        shiftEnd: s.shiftEnd,
        shiftDuration: s.shiftDuration,
      })),
      holidays: result.holidays.map(h => ({
        date: h.dateStr,
        dateTimestamp: h.date.getTime(),
        jdn: h.jdn,
        holidayType: h.type,
        name: h.name,
      })),
      schedule: result.schedule.map(e => ({
        date: e.dateStr,
        dateTimestamp: e.date.getTime(),
        serviceId: e.serviceId,
        serviceName: e.serviceName,
        primaryStaffId: e.primaryStaffId,
        primaryStaffName: e.primaryStaffName,
        secondaryStaffId: e.secondaryStaffId,
        secondaryStaffName: e.secondaryStaffName,
        isEmpty: e.isEmpty,
      })),
    });
  },
});

export const storeParseResults = mutation({
  args: {
    fileId: v.id("amionFiles"),
    siteId: v.string(),
    department: v.string(),
    lastModified: v.number(),
    contact: v.optional(v.string()),
    yearRange: v.optional(v.string()),
    staff: v.array(v.object({
      staffId: v.number(),
      unid: v.number(),
      name: v.string(),
      abbreviation: v.string(),
      staffType: v.number(),
      pager: v.optional(v.string()),
      phone: v.optional(v.string()),
    })),
    services: v.array(v.object({
      serviceId: v.number(),
      unid: v.number(),
      name: v.string(),
      serviceType: v.number(),
      parentId: v.optional(v.number()),
      shiftStart: v.optional(v.number()),
      shiftEnd: v.optional(v.number()),
      shiftDuration: v.optional(v.number()),
    })),
    holidays: v.array(v.object({
      date: v.string(),
      dateTimestamp: v.number(),
      jdn: v.number(),
      holidayType: v.number(),
      name: v.string(),
    })),
    schedule: v.array(v.object({
      date: v.string(),
      dateTimestamp: v.number(),
      serviceId: v.number(),
      serviceName: v.string(),
      primaryStaffId: v.optional(v.number()),
      primaryStaffName: v.optional(v.string()),
      secondaryStaffId: v.optional(v.number()),
      secondaryStaffName: v.optional(v.string()),
      isEmpty: v.boolean(),
    })),
  },
  handler: async (ctx, args) => {
    // Update file metadata
    await ctx.db.patch(args.fileId, {
      siteId: args.siteId,
      department: args.department,
      lastModified: args.lastModified,
      contact: args.contact,
      yearRange: args.yearRange,
      parsed: true,
      staffCount: args.staff.length,
      serviceCount: args.services.length,
      scheduleCount: args.schedule.length,
    });
    
    // Store staff
    for (const staff of args.staff) {
      await ctx.db.insert("amionStaff", {
        fileId: args.fileId,
        ...staff,
        pagerNormalized: staff.pager?.replace(/\D/g, ''),
      });
    }
    
    // Store services
    for (const service of args.services) {
      await ctx.db.insert("amionServices", {
        fileId: args.fileId,
        serviceId: service.serviceId,
        unid: service.unid,
        name: service.name,
        serviceType: service.serviceType,
        parentId: service.parentId,
        shiftStartQuarterHour: service.shiftStart,
        shiftEndQuarterHour: service.shiftEnd,
        shiftDurationQuarterHour: service.shiftDuration,
      });
    }
    
    // Store holidays
    for (const holiday of args.holidays) {
      await ctx.db.insert("amionHolidays", {
        fileId: args.fileId,
        ...holiday,
      });
    }
    
    // Store schedule (batch for performance)
    for (const entry of args.schedule) {
      await ctx.db.insert("amionSchedule", {
        fileId: args.fileId,
        ...entry,
      });
    }
  },
});

// --------------------------------------------------------------------------
// QUERIES
// --------------------------------------------------------------------------

export const getFileById = query({
  args: { fileId: v.id("amionFiles") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.fileId);
  },
});

export const listFiles = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("amionFiles")
      .order("desc")
      .collect();
  },
});

export const getStaffByFile = query({
  args: { fileId: v.id("amionFiles") },
  handler: async (ctx, args) => {
    return await ctx.db.query("amionStaff")
      .withIndex("by_file", q => q.eq("fileId", args.fileId))
      .collect();
  },
});

export const getServicesByFile = query({
  args: { fileId: v.id("amionFiles") },
  handler: async (ctx, args) => {
    return await ctx.db.query("amionServices")
      .withIndex("by_file", q => q.eq("fileId", args.fileId))
      .collect();
  },
});

export const getScheduleByDateRange = query({
  args: {
    fileId: v.id("amionFiles"),
    startDate: v.string(),
    endDate: v.string(),
    serviceName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db.query("amionSchedule")
      .withIndex("by_file_date", q => q.eq("fileId", args.fileId));
    
    const results = await query.collect();
    
    return results.filter(entry => {
      const inRange = entry.date >= args.startDate && entry.date <= args.endDate;
      const matchesService = !args.serviceName || 
        entry.serviceName.toLowerCase().includes(args.serviceName.toLowerCase());
      return inRange && matchesService;
    });
  },
});

export const getProviderSchedule = query({
  args: {
    providerId: v.id("providers"),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    // Get all schedule entries for this provider
    const entries = await ctx.db.query("amionSchedule")
      .withIndex("by_primary_provider", q => q.eq("primaryProviderId", args.providerId))
      .collect();
    
    return entries.filter(e => e.date >= args.startDate && e.date <= args.endDate);
  },
});

// --------------------------------------------------------------------------
// PROVIDER MATCHING
// --------------------------------------------------------------------------

export const matchStaffToProviders = mutation({
  args: { fileId: v.id("amionFiles") },
  handler: async (ctx, args) => {
    const amionStaff = await ctx.db.query("amionStaff")
      .withIndex("by_file", q => q.eq("fileId", args.fileId))
      .collect();
    
    const providers = await ctx.db.query("providers").collect();
    
    for (const staff of amionStaff) {
      let matchedProvider = null;
      let confidence = null;
      
      // Try pager match first (most reliable)
      if (staff.pagerNormalized) {
        matchedProvider = providers.find(p => 
          p.pager?.replace(/\D/g, '') === staff.pagerNormalized
        );
        if (matchedProvider) confidence = "pager";
      }
      
      // Try name match if no pager match
      if (!matchedProvider) {
        const staffNameLower = staff.name.toLowerCase();
        matchedProvider = providers.find(p => {
          const providerName = `${p.lastName}, ${p.firstName}`.toLowerCase();
          return staffNameLower.includes(p.lastName?.toLowerCase() || '') &&
                 staffNameLower.includes(p.firstName?.toLowerCase() || '');
        });
        if (matchedProvider) confidence = "name";
      }
      
      if (matchedProvider) {
        await ctx.db.patch(staff._id, {
          matchedProviderId: matchedProvider._id,
          matchConfidence: confidence,
        });
      }
    }
  },
});

export const manualMatchStaff = mutation({
  args: {
    amionStaffId: v.id("amionStaff"),
    providerId: v.id("providers"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.amionStaffId, {
      matchedProviderId: args.providerId,
      matchConfidence: "manual",
    });
  },
});

// --------------------------------------------------------------------------
// STRIKE COVERAGE INTEGRATION
// --------------------------------------------------------------------------

export const getStrikeProviderAvailability = query({
  args: {
    strikeStartDate: v.string(),
    strikeEndDate: v.string(),
  },
  handler: async (ctx, args) => {
    // Get all schedule entries for the strike period
    const scheduleEntries = await ctx.db.query("amionSchedule")
      .withIndex("by_date")
      .filter(q => 
        q.and(
          q.gte(q.field("date"), args.strikeStartDate),
          q.lte(q.field("date"), args.strikeEndDate)
        )
      )
      .collect();
    
    // Group by provider and date
    const providerSchedule = new Map();
    
    for (const entry of scheduleEntries) {
      if (entry.primaryProviderId) {
        const key = `${entry.primaryProviderId}-${entry.date}`;
        if (!providerSchedule.has(key)) {
          providerSchedule.set(key, []);
        }
        providerSchedule.get(key).push(entry);
      }
    }
    
    return {
      entries: scheduleEntries,
      providerScheduleCount: providerSchedule.size,
    };
  },
});
