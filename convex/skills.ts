import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Default skills from PRD - 32 skills in 3 categories
const DEFAULT_SKILLS = [
  // Basic Skills (11)
  { name: "ACLS", category: "Basic", description: "Advanced Cardiovascular Life Support" },
  { name: "PALS", category: "Basic", description: "Pediatric Advanced Life Support" },
  { name: "NRP", category: "Basic", description: "Neonatal Resuscitation Program" },
  { name: "BLS", category: "Basic", description: "Basic Life Support" },
  { name: "IV Access", category: "Basic", description: "Intravenous Access" },
  { name: "Phlebotomy", category: "Basic", description: "Blood Draw" },
  { name: "EKG Interpretation", category: "Basic", description: "Electrocardiogram Reading" },
  { name: "Medication Administration", category: "Basic", description: "Administering Medications" },
  { name: "Wound Care", category: "Basic", description: "Basic Wound Management" },
  { name: "Patient Assessment", category: "Basic", description: "Clinical Assessment Skills" },
  { name: "Documentation", category: "Basic", description: "Medical Documentation" },

  // Procedural Skills (12)
  { name: "Central Line Placement", category: "Procedural", description: "Central Venous Catheter Insertion" },
  { name: "Arterial Line Placement", category: "Procedural", description: "Arterial Catheter Insertion" },
  { name: "Intubation", category: "Procedural", description: "Endotracheal Intubation" },
  { name: "Chest Tube Insertion", category: "Procedural", description: "Thoracostomy Tube Placement" },
  { name: "Lumbar Puncture", category: "Procedural", description: "Spinal Tap" },
  { name: "Paracentesis", category: "Procedural", description: "Abdominal Fluid Drainage" },
  { name: "Thoracentesis", category: "Procedural", description: "Pleural Fluid Drainage" },
  { name: "Cardioversion", category: "Procedural", description: "Electrical Cardioversion" },
  { name: "Defibrillation", category: "Procedural", description: "Emergency Defibrillation" },
  { name: "Ventilator Management", category: "Procedural", description: "Mechanical Ventilation" },
  { name: "Conscious Sedation", category: "Procedural", description: "Procedural Sedation" },
  { name: "Suturing", category: "Procedural", description: "Wound Closure" },

  // Specialty Skills (9)
  { name: "Cardiac Monitoring", category: "Specialty", description: "Advanced Cardiac Telemetry" },
  { name: "Hemodynamic Monitoring", category: "Specialty", description: "Invasive Pressure Monitoring" },
  { name: "CRRT", category: "Specialty", description: "Continuous Renal Replacement Therapy" },
  { name: "ECMO", category: "Specialty", description: "Extracorporeal Membrane Oxygenation" },
  { name: "Dialysis", category: "Specialty", description: "Hemodialysis" },
  { name: "Chemotherapy Administration", category: "Specialty", description: "Oncology Drug Administration" },
  { name: "Blood Transfusion", category: "Specialty", description: "Transfusion Management" },
  { name: "Stroke Assessment", category: "Specialty", description: "NIH Stroke Scale" },
  { name: "Trauma Care", category: "Specialty", description: "Advanced Trauma Life Support" },
];

/**
 * List all active skills
 */
export const list = query({
  handler: async (ctx) => {
    return await ctx.db
      .query("skills")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
  },
});

/**
 * List skills by category
 */
export const listByCategory = query({
  handler: async (ctx) => {
    const skills = await ctx.db
      .query("skills")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    const byCategory: Record<string, typeof skills> = {};

    for (const skill of skills) {
      if (!byCategory[skill.category]) {
        byCategory[skill.category] = [];
      }
      byCategory[skill.category].push(skill);
    }

    return byCategory;
  },
});

/**
 * List all skills (including inactive) - for admin view
 */
export const listAll = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    // Only super_admin can see all skills including inactive
    if (!currentUser || currentUser.role !== "super_admin") {
      return await ctx.db
        .query("skills")
        .filter((q) => q.eq(q.field("isActive"), true))
        .collect();
    }

    return await ctx.db.query("skills").collect();
  },
});

/**
 * Seed default skills (only for super_admin)
 */
export const seedDefaults = mutation({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!currentUser || currentUser.role !== "super_admin") {
      throw new Error("Only super admins can seed default skills");
    }

    // Check if skills already exist
    const existingSkills = await ctx.db.query("skills").collect();
    if (existingSkills.length > 0) {
      return { seeded: 0, message: "Skills already exist" };
    }

    let seeded = 0;
    for (const skill of DEFAULT_SKILLS) {
      await ctx.db.insert("skills", {
        name: skill.name,
        category: skill.category,
        description: skill.description,
        isSystemDefault: true,
        isActive: true,
      });
      seeded++;
    }

    // Log the action
    await ctx.db.insert("audit_logs", {
      userId: currentUser._id,
      action: "SEED_DEFAULT_SKILLS",
      resourceType: "SKILL",
      changes: { count: seeded },
      timestamp: Date.now(),
    });

    return { seeded, message: `Seeded ${seeded} default skills` };
  },
});

/**
 * Create a custom skill (super_admin only)
 */
export const create = mutation({
  args: {
    name: v.string(),
    category: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!currentUser || currentUser.role !== "super_admin") {
      throw new Error("Only super admins can create skills");
    }

    // Check for duplicate name
    const existing = await ctx.db
      .query("skills")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();

    if (existing) {
      throw new Error(`Skill "${args.name}" already exists`);
    }

    const skillId = await ctx.db.insert("skills", {
      name: args.name,
      category: args.category,
      description: args.description,
      isSystemDefault: false,
      isActive: true,
    });

    await ctx.db.insert("audit_logs", {
      userId: currentUser._id,
      action: "CREATE_SKILL",
      resourceType: "SKILL",
      resourceId: skillId,
      changes: { name: args.name, category: args.category },
      timestamp: Date.now(),
    });

    return { skillId };
  },
});

/**
 * Update a skill (super_admin only)
 */
export const update = mutation({
  args: {
    skillId: v.id("skills"),
    name: v.optional(v.string()),
    category: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!currentUser || currentUser.role !== "super_admin") {
      throw new Error("Only super admins can update skills");
    }

    const skill = await ctx.db.get(args.skillId);
    if (!skill) throw new Error("Skill not found");

    // If changing name, check for duplicates
    if (args.name && args.name !== skill.name) {
      const newName = args.name;
      const existing = await ctx.db
        .query("skills")
        .withIndex("by_name", (q) => q.eq("name", newName))
        .first();

      if (existing) {
        throw new Error(`Skill "${newName}" already exists`);
      }
    }

    const updates: Record<string, string | undefined> = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.category !== undefined) updates.category = args.category;
    if (args.description !== undefined) updates.description = args.description;

    await ctx.db.patch(args.skillId, updates);

    await ctx.db.insert("audit_logs", {
      userId: currentUser._id,
      action: "UPDATE_SKILL",
      resourceType: "SKILL",
      resourceId: args.skillId,
      changes: updates,
      timestamp: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Toggle skill active status (super_admin only)
 */
export const toggleActive = mutation({
  args: { skillId: v.id("skills") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!currentUser || currentUser.role !== "super_admin") {
      throw new Error("Only super admins can toggle skill status");
    }

    const skill = await ctx.db.get(args.skillId);
    if (!skill) throw new Error("Skill not found");

    await ctx.db.patch(args.skillId, { isActive: !skill.isActive });

    await ctx.db.insert("audit_logs", {
      userId: currentUser._id,
      action: skill.isActive ? "DEACTIVATE_SKILL" : "ACTIVATE_SKILL",
      resourceType: "SKILL",
      resourceId: args.skillId,
      changes: { name: skill.name },
      timestamp: Date.now(),
    });

    return { isActive: !skill.isActive };
  },
});
